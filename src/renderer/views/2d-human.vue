<template>
  <div class="content-pannel">
    <div class="video-pannel">
      <video id="video" class="video-control-box video-fill" loop="loop" preload="auto"
        :poster="require('../assets/hostee.png')">
        <!--        <source :src="require('../assets/test.mp4')">-->
        <source :src="videoUrl">
      </video>
      <audio id="audio" :src="resultAudioUrl || undefined" preload="metadata"></audio>

      <div class="origin-bg-box" v-if="showOriginText"></div>

      <!-- 查看政策原文框 -->
      <div class="origin-text-box">
        <iframe class="origin-iframe-box" id="iframe" v-if="showOriginText && originUrl && originUrl.length > 0"
          :src="originUrl" ref="iframe" @load="iFrameLoaded"></iframe>
        <!-- v-if="showOriginBtn" -->
        <el-button round type="primary" class="origin-btn-box" @click="originBtnClick">{{
          originBtnText }}</el-button>
      </div>

      <div class="reging-box">
        <div>{{ curSrResult }}</div>
      </div>

      <div class="show-user-guide-box" @mousedown.prevent="startLongPress" @mouseup.prevent="cancelLongPress"
        @mouseleave.prevent="cancelLongPress" @touchstart.prevent="startLongPress" @touchend.prevent="cancelLongPress" v-if="!showOriginText">
        <img :src="require('../assets/guide.png')" @dragstart.prevent>
      </div>

      <!-- 摄像头数据 -->
      <div class="camera-panel" ref="cameraPanel" id="cameraPanel" v-if="showCamera">
        <!--        <video class="camera-content" ref="camera" autoplay playsinline></video>-->
        <canvas id="headPose" class="camera-overlay" ref="overlay"></canvas>
      </div>

      <!-- 临时调试信息 -->
      <div class="debug-info" v-if="false"
        style="position: absolute; top: 100px; left: 20px; background: rgba(0,0,0,0.7); color: white; padding: 10px; font-size: 12px; z-index: 6000;">
        <div>showCamera: {{ showCamera }}</div>
        <div>interactiveStatus: {{ interactiveStatus }}</div>
        <div>isCameraInit: {{ isCameraInit }}</div>
        <div>cameraIp: {{ cameraIp }}</div>
        <div>pageStatus: {{ pageStatus }}</div>
        <div>hasSayHello: {{ hasSayHello }}</div>
        <div>eyeIsDirectly: {{ eyeIsDirectly }}</div>
        <div>canInteract: {{ canInteract }}</div>
      </div>

      <!-- 答案框 v-if="showQuestionBox" -->
      <div class="content-box" ref="container">
        <!--问题 -->
        <div class="question-box">
          <!-- <div v-if="errorInfo">{{ errorInfo }}</div> -->
          <!-- <div v-if="curQuestion && curQuestion.question.length > 0">{{ displayQuestion }}</div> -->
          <div v-if="curQuestion && curQuestion.question.length > 0">{{ curQuestion.question }}</div>
          <div v-else></div>

          <!-- {{ displayQuestion }} -->
        </div>
        <div class="seperate-line"></div>
        <!-- 指示区域  回答完成就不要展示了-->
        <div class="notice-box" v-if="pageStatus !== -1 && pageStatus !== 14">
          <i class="el-icon-loading"></i>当前状态：
          <transition name="status-update" mode="out-in">
            <div class="status-text" :key="pageStatus + '-' + currentStatusTimestamp">
              {{ pageStatusMap[pageStatus] }} ({{ currentStatusTimestamp?.toLocaleTimeString() }})
            </div>
          </transition>
        </div>
        <!--答案 -->
        <div class="answer-box">
          <div v-if="pageStatus === 14 && curQuestion.answer && curQuestion.answer.length > 0">{{ curQuestion.answer }}
          </div>
          <div v-else-if="pageStatus >= 9 && pageStatus < 14" ref="answeringBox">
            <!-- 内容  -->
            <div v-if="showAnswer && showAnswer.length > 0">{{ showAnswer }}</div>
            <div v-else></div>
          </div>
          <div class="ref-doc-list" v-else-if="pageStatus >= 7 && pageStatus < 9">
            <!-- 调试：触发refList状态监控 -->
            <span v-if="debugRefListState" style="display: none;"></span>
            <div v-if="curQuestion">
              <div v-if="curQuestion.question && curQuestion.selectedIndex === -1">
                <div class="ref-doc-hint">请触屏选择或语音说出您想要了解的政策文件序号：</div>
                <div style="margin-top: 10px">
                  <el-table width="100%" :data="curQuestion.refList || []" border stripe
                    @current-change="refListSelected">
                    <el-table-column type="index" label="序号" width="50" align="center"></el-table-column>
                    <el-table-column prop="fileName" label="文件名称"></el-table-column>
                  </el-table>
                </div>
              </div>
              <div v-else>
                <div class="ref-doc-hint in"
                  v-if="curQuestion.selectedIndex >= 0 && curQuestion.refList[curQuestion.selectedIndex]">
                  您选择了解的政策文件名称是：{{ curQuestion.refList[curQuestion.selectedIndex].fileName }}
                </div>
              </div>
            </div>
            <div v-else></div>
          </div>
          <div v-else></div>
        </div>
      </div>

      <!-- 点我提问 -->
      <!-- <div class="ask-question-box" id="askQuestionBox" @click="askQuestionClick" v-if="showAskQuestion">
        <img :src="require('../assets/hostee-small.png')" class="ask-question-img" v-show="showOriginText" />
        <el-button ref="askQuestion" id="askQuestion" round type="primary" class="ask-question-hint">点我提问</el-button>
      </div> -->

      <!-- 新增：眼球交互提示 -->
      <div class="eye-interaction-hint" v-if="shouldShowEyeHint">
        <div class="hint-content">
          <i class="el-icon-view"></i>
          <span>正视摄像头开始语音对话</span>
        </div>
      </div>

      <!-- 引导图 -->
      <!-- <div class="user-guide" v-if="showUserGuide" @click="userGuideClick">
        <img :src="userGuideSteps[userGuideIndex]" />
      </div> -->

    </div>
  </div>
</template>

<script>
import { get_ref_doc_list, intent_recognize } from "../api/common";
const { ipcRenderer } = require('electron')
import AnceStreamAudioPlayer from '../utils/ance-stream-audio-player'
import ANCETtsSocketService from "../utils/ance-tts-socket"
import VideoSocketClient from "../iflySocket/VideoSocketClient"
import BGRUtil from "../iflySocket/BGRUtil";
import jpeg from "jpeg-js";

import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

export default {
  name: 'VHuman',
  data() {
    return {
      driver: null,
      baseUrl: process.env.VUE_APP_BASE_API,
      noAnswer: '我在文件库中无法找到您问题的相关参考文件，暂时无法回答您的问题。',
      result: '',
      resultAudioUrl: "",
      needStartVad: false,
      needReWaken: false,
      // 长按
      showUserGuideIndex: 0,
      longPressTimer: null,
      isLongPressing: false,
      pressStartTime: null,

      // 视频播放器
      isPlaying: false,
      videoPlayerPromise: null,
      videoUrl: null,

      // 网络连接
      isConnected: true,
      errorInfo: null,

      // 当前问题
      curQuestion: { "question": "", "answer": "", "url": null, refList: [], originRefList: [], selectedIndex: -1 },
      // showQuestionBox: false,

      // 流式播放
      toTTSAnswer: '',
      streamAudioPlayer: null,
      lastStreamTime: null, // 记录最后一次收到流式数据的时间

      // 客户端做流式tts
      ttsWebsocket: null,
      sendedLength: 0,
      streamTTSTimer: null,
      canStopTTSTimer: false,
      ttsPlaying: false,

      // 是否正在语音识别
      isRecognizing: false,
      curSrResult: "",   // 正在识别的文字

      // 正在回答问题的答案
      showAnswer: "",
      showedIndex: 0,
      streamTimer: null,
      textDisplayCompleted: false, // 新增：标记文本是否展示完成
      retryTimes: 0,

      // 取消请求使用
      cancel: null,

      // sdk状态（未使用）  1 未唤醒  2 唤醒成功  3 语音识别中  4 语音识别成功  5 语音识别失败
      sdkStatus: 1,
      // 页面状态  3 意图识别  4意图识别成功  5意图识别失败   6 获取参考资料中  7 获取参考资料成功  8 获取参考资料失败  9 获取答案中  10 获取答案成功
      // 11 获取答案失败   12 合成语音答案中  13 语音播报中  14 完成回答
      pageStatusMap: {
        3: '意图识别',
        4: '意图识别成功',
        5: '意图识别失败,请重新提问',
        6: '获取参考资料中',
        7: '获取参考资料成功',
        8: '获取参考资料失败',
        9: '获取答案中',
        10: '获取答案成功',
        11: '获取答案失败',
        12: '合成语音答案中',
        13: '语音播报中',
        14: '完成回答'
      },
      pageStatus: -1,
      currentStatusTimestamp: null,
      // interactiveStatus:  1 交互状态   2 非交互状态
      interactiveStatus: 1, // 修改：默认启动就进入交互状态
      // 中文数词和阿拉伯数字转换 - 扩展版本
      chnNumberChar: {
        零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
        列表第一: 1, 列表第二: 2, 列表第三: 3, 列表第四: 4, 列表第五: 5, 列表第六: 6, 列表第七: 7, 列表第八: 8, 列表第九: 9, 列表第十: 10,
        // 添加其他常见表达方式
        第一: 1, 第二: 2, 第三: 3, 第四: 4, 第五: 5, 第六: 6, 第七: 7, 第八: 8, 第九: 9, 第十: 10,
        // 添加条数表达
        一条: 1, 二条: 2, 三条: 3, 四条: 4, 五条: 5, 六条: 6, 七条: 7, 八条: 8, 九条: 9, 十条: 10,
        // 添加个数表达
        一个: 1, 二个: 2, 三个: 3, 四个: 4, 五个: 5, 六个: 6, 七个: 7, 八个: 8, 九个: 9, 十个: 10
      },

      // 是否全屏手势
      startX: 0,
      isDragging: false,

      // video data
      cameraIp: process.env.VUE_APP_DEVICE_IP,
      cameraPort: '9090',
      videoSocketClient: null,
      pixels: null,

      // 防止消息重复
      lastIatMsg: null,
      lastReceiveTimestamp: null,
      MSG_INTERVAL: 3000,

      // endMsgTimer
      endMsgTimer: null,

      // 摄像头相关变量
      isCameraInit: false,
      showCamera: true, // 修改：默认显示摄像头

      // 查看原文相关变量
      originUrl: '',
      showOriginText: false,
      showOriginBtn: false,
      originBtnText: '查看原文',

      // 点我提问按钮
      showAskQuestion: false, // 修改：默认隐藏点我提问按钮

      // 是否已经打过招呼
      hasSayHello: false, // 修改：启动时设置为false，让系统检测到人脸时执行打招呼
      // fadeRefList : [{"id": "63a477e2-c3fb-4002-a1ad-18a1e29a6ec2", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9810100635230796}, {"id": "2f3bd101-b23c-4f9c-9965-c0fc15d98936", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9810100635230796}, {"id": "6a5032a5-aa27-4587-aba6-8981dadabac8", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9810100590815034}, {"id": "4335f864-bd5f-493d-9585-2618ac94e312", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9783174498198205}, {"id": "d8293fd8-216e-47e0-aa5b-e23eacbbedf2", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9783174498198205}, {"id": "ab5ac820-a9a8-47b3-8f9f-e62b4a5999cd", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9783174498198205}, {"id": "502521f5-5a52-4a17-919e-9db46023b81f", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9783174498198205}, {"id": "fab7ec19-eafd-4643-8a8a-0a721d1fb4c4", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9783174498198205}, {"id": "497513c8-214c-44b9-ba5b-0d71e2ecac7d", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9783174498198205}, {"id": "9cd67be4-7992-414a-8e14-887fda7c90aa", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9783174498198205}]

      showUserGuide: false,
      userGuideIndex: 0,
      isFullscreen: false,

      // 意图识别相关
      preMsgs: [],
      maxPreMsgsCount: 3, // 限制最多保存3个历史问题
      preMsgsTimeout: null, // 意图识别数组计时器
      preMsgsTimeoutDuration: 60000, // 60s后自动清空历史问题

      // 人眼睛是否正视摄像头
      eyeIsDirectly: false,

      // 眼球状态管理 - 优化配置
      eyeStateRecords: [],           // 记录最近的眼球状态
      isNoReferenceAudioPlaying: false, // 是否正在播放"未找到参考资料"音频
      noReferenceAudioEndCallback: null, // "未找到参考资料"音频结束回调引用
      eyeStateMaxRecords: 8,         // 增加记录数量，提高稳定性
      eyeStateDuration: 1000,        // 延长判断时间窗口到1秒
      eyeStateThreshold: 0.65,       // 降低阈值，65%即可判定为正视
      eyeLastUpdateTime: Date.now(), // 上次更新时间
      eyeStateCleanTimer: null,      // 眼球状态清理计时器

      // 新增：头部姿态状态管理
      headPoseRecords: [],           // 记录头部姿态状态
      headPoseMaxRecords: 6,         // 增加头部姿态记录数量，提高稳定性
      headPoseDuration: 800,         // 延长头部姿态判断窗口
      headPoseThreshold: 0.7,        // 降低头部姿态判断阈值，70%即可

      // 新增：综合状态判定
      canInteract: false,            // 综合判定是否可以交互
      lastInteractCheck: 0,          // 上次交互检查时间
      interactCheckInterval: 100,    // 缩短交互检查间隔到100ms

      offscreenCanvas: null,         // 离屏canvas
      offscreenCtx: null,            // 离屏canvas上下文

      // 基础帧率控制相关
      lastFrameTime: 0,              // 上次帧处理时间
      lastIrisTime: 0,               // 上次iris检测时间
      lastFrameHasFace: false,       // 上次帧是否有人脸
      lastEyeDirectlyLog: false,     // 上次眼球状态日志记录

      // iris worker健康检查
      irisHealthCheckTimer: null,    // 健康检查定时器
      lastIrisDataReceiveTime: Date.now(),    // 上次收到iris数据的时间
      irisResetRetryCount: 0,        // iris worker重置重试计数器
    }
  },
  created() {
    this.$ANCESocket.connect(this)
    this.ttsWebsocket = new ANCETtsSocketService(this.ttsAudioStart, this.ttsPlayStop)
    this.login()
    this.setUpNetworkTimer()
    this.videoUrl = process.env.VUE_APP_MINIO_URL + "test.mp4"
    this.setupWorkerNotify()

    // 添加：创建离屏Canvas以复用
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');

    // 注释掉：将摄像头初始化移到mounted钩子中
    // this.initializeCameraOnStartup()
  },
  beforeDestroy() {
    this.stopEndMsgTimer()
    if (this.preMsgsTimeout) {
      clearTimeout(this.preMsgsTimeout)
      this.preMsgsTimeout = null
    }
    // 清除眼球状态清理计时器
    if (this.eyeStateCleanTimer) {
      clearInterval(this.eyeStateCleanTimer);
    }
  },
  watch: {
    isConnected(newVal, oldVal) {
      if (newVal !== oldVal) {
        this.$message.info(newVal ? '网络已连接' : '网络已断开')
        this.errorInfo = newVal ? '' : '网络连接出错，请稍候再试。'
        this.interactiveStatus = 2
      }
    },
    interactiveStatus(newVal, oldVal) {
      // console.log(`interactiveStatus old: ${oldVal} -> new: ${newVal}`)
      if (1 === newVal) {
        // 交互模式
        this.curSrResult = ""
        this.showAskQuestion = false
        this.showOriginText = false
        this.originBtnText = '查看原文'
        this.showOriginBtn = false
        this.showCamera = true
        this.resizeCanvas()
        this.setupVideoClient()
        if (!this.isCameraInit) {
          this.isCameraInit = true
        }
        // 设置窗口置顶
        ipcRenderer.send('window-set-always-on-top', true);
      } else {
        // 非交互模式 - 修改：保持摄像头显示，但显示引导按钮
        this.showAskQuestion = true
        // 注意：现在保持摄像头显示，这样用户可以通过眼球正视重新激活交互
        // this.showCamera = false  // 注释掉这行，保持摄像头显示
        // this.clearVideoBitmap()  // 注释掉这行，保持视频显示
        // 取消窗口置顶
        ipcRenderer.send('window-set-always-on-top', false);
      }
      // 从非交互模型到交互模型，需要重新打招呼
      if (oldVal === 2 && newVal === 1) {
        if (this.pageStatus >= 3 && this.pageStatus <= 7) {
          // console.log('意图不清晰，不需要需要重新打招呼')
        } else {
          // console.log('从非交互模型到交互模型，需要重新打招呼')
          this.hasSayHello = false
        }
      }
    },
    showCamera(newVal, oldVal) {
      if (newVal === false) {
        this.curSrResult = ''
      }
    },
    pageStatus(newVal, oldVal) {
      // console.info(`pageStatus: ${oldVal} -> ${newVal}`)
      this.currentStatusTimestamp = new Date()
      this.checkAnsweringBoxObserver()

      // 如果从回答状态转为完成状态，准备下次交互的眼球状态重置
      if (oldVal >= 9 && oldVal < 14 && newVal === 14) {
        // console.log('回答完成，准备重置眼球状态');
        // 延迟重置，让用户有时间处理当前回答
        setTimeout(() => {
          if (this.pageStatus === 14) { // 确保仍然是完成状态
            // 对于正常回答完成，使用温和的重置策略
            // 保留一些眼球记录，让用户更容易继续对话
            const keepRecords = Math.ceil(this.eyeStateRecords.length * 0.3); // 保留30%
            this.eyeStateRecords = this.eyeStateRecords.slice(-keepRecords);

            const keepHeadRecords = Math.ceil(this.headPoseRecords.length * 0.3);
            this.headPoseRecords = this.headPoseRecords.slice(-keepHeadRecords);

            // 重置交互状态，但不完全清空eyeIsDirectly
            this.canInteract = false;
            this.eyeLastUpdateTime = Date.now();
            this.lastInteractCheck = 0;

            // 确保下次需要重新唤醒
            this.sdkStatus = 1;
            // console.log('回答完成：温和重置眼球状态');

            // 立即检查当前状态
            setTimeout(() => {
              this.updateEyeDirectlyStatus();
              this.updateInteractionStatus();
            }, 200);
          }
        }, 2000); // 2秒后重置
      }

      // 如果进入意图识别失败状态，确保用户可以快速恢复交互
      if (newVal === 5 && oldVal !== 5) {
        // console.log('进入意图识别失败状态');
        // 确保交互状态为1，允许用户重新提问
        this.interactiveStatus = 1;

        // 【临时修改】简化快速恢复逻辑：基于头部姿态而不是eyeIsDirectly
        // 原逻辑：if (this.pageStatus === 5 && this.eyeIsDirectly)
        setTimeout(() => {
          if (this.pageStatus === 5 && this.canInteract) {
            console.log('🎯 快速恢复交互状态');
            this.canInteract = true;
          }
        }, 500); // 500ms后检查
      }
    }
  },
  computed: {
    userName() {
      return this.$store.state.user.name
    },
    audioPlayer() {
      return document.getElementById('audio')
    },
    videoPlayer() {
      return document.getElementById('video')
    },
    // 新增：控制眼球交互提示的显示
    shouldShowEyeHint() {
      // 在交互状态下，且没有正在进行对话时显示提示
      return this.interactiveStatus === 1 &&
        this.showCamera &&
        (this.pageStatus === -1 || this.pageStatus === 14) &&
        !this.showOriginText &&
        !this.showUserGuide
    },

    // 🔧 调试：监控refList状态
    debugRefListState() {
      if (this.pageStatus >= 7 && this.pageStatus <= 8) {
        // console.log('🖼️ 模板计算属性监控refList:', {
        //   pageStatus: this.pageStatus,
        //   curQuestionExists: !!this.curQuestion,
        //   refListExists: !!this.curQuestion?.refList,
        //   refListLength: this.curQuestion?.refList?.length || 0,
        //   refListData: this.curQuestion?.refList
        // })
      }
      return true
    },
    displayQuestion() {
      // console.log(this.curQuestion);
      // 从this.curQuestion 对象中获取所有问题


      let question = this.curQuestion.question.split().map((item) => {
        return item
      }).join('')
      // console.log(question);
      // 我希望字符串拼接起来，取最新的两条即可
      let questionList = question.split('，')
      if (questionList.length > 2) {
        question = questionList[questionList.length - 2] + '，' + questionList[questionList.length - 1]
      }
      return question
      // return this.curQuestion.map((item) => {
      //   return item.q
      // }).join('')
    }
  },
  mounted() {
    // console.log('主页面');

    // this.registerGestures()
    this.initRecorder()
    this.observeAnsweringBox()
    this.showUserGuidePic()

    // 新增：在DOM挂载后初始化摄像头
    this.initializeCameraOnStartup()

    // 新增：设置音频播放事件监听器
    this.$nextTick(() => {
      this.setupAudioEventListeners();
    });

    // 🔧 新增：监听窗口大小变化，防止视频框变窄
    this.setupWindowResizeHandler();

    // 新增：监听window级别的音频事件，确保能捕获到所有音频结束事件
    window.addEventListener('audioended', () => {
      console.log('🔊 检测到全局音频结束事件');
      this.handleAudioPlaybackEnd();
    });

    // 添加眼球状态清理计时器
    this.eyeStateCleanTimer = setInterval(() => {
      this.cleanExpiredEyeStates();
    }, 200); // 恢复到原来的200毫秒检查一次

    // 🔧 暴露调试方法到全局
    window.debugVHuman = this.debugCurrentState.bind(this)
    window.testIrisReset = () => {
      // console.log('🧪 手动触发iris worker重置测试');
      this.sendMsgToMain('window-message-from-renderer', {
        type: 'resetWorker',
        timestamp: Date.now()
      });
    }
    // console.log('🔧 调试方法已暴露：')
    // console.log('  - debugVHuman() 查看当前状态')
    // console.log('  - testIrisReset() 手动测试重置')

    // 启动iris worker健康检查
    this.startIrisHealthCheck()
  },
  beforeDestroy() {
    // 清理定时器
    if (this.eyeStateCleanTimer) {
      clearInterval(this.eyeStateCleanTimer);
    }
    if (this.irisHealthCheckTimer) {
      clearInterval(this.irisHealthCheckTimer);
    }

    // 清理音频事件监听器
    const audioPlayer = this.audioPlayer;
    if (audioPlayer) {
      audioPlayer.removeEventListener('ended', this.handleAudioPlaybackEnd);
      audioPlayer.removeEventListener('play', () => { });
      audioPlayer.removeEventListener('pause', () => { });
      audioPlayer.removeEventListener('error', this.handleAudioPlaybackEnd);
    }

    // 清理window事件监听器
    window.removeEventListener('audioended', this.handleAudioPlaybackEnd);

    // 🔧 新增：清理窗口大小变化监听器
    if (this._resizeCleanup) {
      this._resizeCleanup();
    }

    // console.log('🧹 组件销毁，事件监听器已清理');
  },
  methods: {
    initDriver() {
      const driverObj = driver({
        showProgress: true,
        animate: true,
        nextBtnText: '下一步',
        prevBtnText: '上一步',
        doneBtnText: '完成',
        closeBtnText: '关闭',
        steps: [
          { element: this.$refs.cameraPanel, popover: { title: '第一步', description: '需人脸在框内并进行人脸检测，可以开始对话' } },
          { element: this.$refs.cameraPanel, popover: { title: '第二步', description: '对话时候，要正视摄像头,语音说出问题，比如“棚户区改造”' } },
          { element: '.question-box', popover: { title: '第三步', description: '这里会展示你刚才语音提出的问题' } },
          { element: '.answer-box', popover: { title: '第四步', description: '这里会展示相应的参考文件，可以说“列表第二项”、“第二个”或手动点击列表项展示答案' } },
          { element: '.answer-box', popover: { title: '第五步', description: '这里也是答案展示出，会给出模型结合参考文件生成的答案' } },
          { element: '.origin-btn-box', popover: { title: '第六步', description: '点击按钮，查看原文件内容' } },
          { element: '.show-user-guide-box', popover: { title: '第七步', description: '长按全屏展示或者取消全屏' } },
        ]
      })
      driverObj.drive();
    },
    // 新增：设置音频播放事件监听器
    setupAudioEventListeners() {
      const audioPlayer = this.audioPlayer;
      if (audioPlayer) {
        // 监听音频播放结束事件
        audioPlayer.addEventListener('ended', () => {
          console.log('🔊 音频播放结束，停止视频播放');
          this.handleAudioPlaybackEnd();
        });

        // 监听音频播放开始事件
        audioPlayer.addEventListener('play', () => {
          console.log('🔊 音频开始播放');
          this.isPlaying = true;
        });

        // 监听音频暂停事件
        audioPlayer.addEventListener('pause', () => {
          console.log('⏸️ 音频暂停播放');
        });

        // 监听音频错误事件
        audioPlayer.addEventListener('error', (error) => {
          // 🔧 修复：避免初始化时因为空src导致的错误日志
          if (this.resultAudioUrl && this.resultAudioUrl.trim() !== '') {
            console.error('❌ 音频播放错误:', error);
            this.handleAudioPlaybackEnd();
          } else {
            console.log('🔇 音频初始化时无src，忽略错误事件');
          }
        });

        // 🔧 新增：监听音频加载错误事件
        audioPlayer.addEventListener('loadstart', () => {
          console.log('🔄 音频开始加载');
        });

        audioPlayer.addEventListener('canplay', () => {
          console.log('✅ 音频可以播放');
        });
      }
    },

    // 新增：处理找不到参考资料时重新开启新对话
    handleNoReferenceFoundNewConversation() {
      // console.log('🔄 开始处理找不到参考资料的新对话流程');

      // 1. 设置状态标识
      this.isNoReferenceAudioPlaying = true;

      // 2. 先播放"未找到相关资料"的提示音频
      this.pageStatus = 11;
      this.toTTSAnswer = this.noAnswer;
      this.curQuestion.answer = this.noAnswer;
      this.curQuestion.refList = null;
      this.curQuestion.originRefList = null;

      // 3. 开始播放提示音频
      this.startStreamTTSTimer();
      this.fakeStreamText(false);

      // 4. 设置音频播放结束后的回调，重置为新对话状态
      this.setupNoReferenceAudioEndCallback();

      console.log('🎵 开始播放"未找到参考资料"提示音频');
    },

    // 新增：设置"未找到参考资料"音频结束后的回调
    setupNoReferenceAudioEndCallback() {
      const audioPlayer = this.audioPlayer;
      if (audioPlayer) {
        // 🔧 修复：清理之前可能存在的监听器，避免重复绑定
        this.clearNoReferenceAudioEndCallback();

        // 创建一个一次性的音频结束监听器
        const onAudioEndForNewConversation = () => {
          // 确保只有在"未找到参考资料"状态下才处理
          if (!this.isNoReferenceAudioPlaying) {
            return;
          }

          console.log('🎵 "未找到参考资料"音频播放完成，准备重置为新对话状态');

          // 延迟重置，给用户时间理解提示信息
          setTimeout(() => {
            this.resetToNewConversationState();
          }, 1500); // 稍微延长到1.5秒，确保用户能理解提示

          // 移除这个一次性监听器
          audioPlayer.removeEventListener('ended', onAudioEndForNewConversation);
          this.noReferenceAudioEndCallback = null; // 清空引用
        };

        // 保存监听器引用，以便后续清理
        this.noReferenceAudioEndCallback = onAudioEndForNewConversation;

        // 添加一次性监听器
        audioPlayer.addEventListener('ended', onAudioEndForNewConversation);
      }
    },

    // 🔧 新增：清理"未找到参考资料"音频结束回调
    clearNoReferenceAudioEndCallback() {
      const audioPlayer = this.audioPlayer;
      if (audioPlayer && this.noReferenceAudioEndCallback) {
        console.log('🧹 清理旧的"未找到参考资料"音频结束监听器');
        audioPlayer.removeEventListener('ended', this.noReferenceAudioEndCallback);
        this.noReferenceAudioEndCallback = null;
      }
    },

    // 新增：重置为新对话状态
    resetToNewConversationState() {
      // console.log('🔄 重置为新对话状态');

      // 1. 停止视频播放
      this.stopPlayVideo();

      // 2. 重置播放状态
      this.isPlaying = false;
      this.isNoReferenceAudioPlaying = false; // 重置"未找到参考资料"音频播放状态

      // 3. 清空当前问题和答案，开启全新对话
      this.curQuestion = {
        question: '',
        answer: '',
        refList: null,
        originRefList: null
      };
      this.toTTSAnswer = '';

      // 4. 重置页面状态到等待状态（类似首次启动）
      this.pageStatus = -1;

      // 5. 重置交互状态为可交互模式，允许用户通过眼球正视重新提问
      this.interactiveStatus = 1;

      // 6. 清空语音识别结果
      this.curSrResult = '';

      // 7. 重置其他相关状态
      this.preMsgs = []; // 清空之前的消息记录

      // console.log('✅ 新对话状态重置完成，用户可通过眼球正视开始新的提问');
      // console.log('📊 当前状态 - pageStatus:', this.pageStatus, ', interactiveStatus:', this.interactiveStatus);

      // 8. 显示眼球交互提示（如果需要）
      this.$nextTick(() => {
        // console.log('👁️ 新对话已准备就绪，等待用户眼球正视交互');
      });
    },

    // 新增：处理音频播放结束
    handleAudioPlaybackEnd() {
      // console.log('🎯 处理音频播放结束事件');
      // console.log('🎯 当前状态 - pageStatus:', this.pageStatus, 'isPlaying:', this.isPlaying);

      // 🔒 关键修复：在文件选择状态下不应该处理音频结束事件
      if (this.pageStatus >= 7 && this.pageStatus <= 8) {
        // console.log('🔒 阻止在文件选择状态下处理音频结束事件，pageStatus:', this.pageStatus);
        return;
      }

      // 防止重复处理
      if (!this.isPlaying) {
        // console.log('⚠️ 播放状态已经是停止，跳过处理');
        return;
      }

      // 检查是否是"未找到参考资料"的音频播放结束，如果是则跳过常规处理
      // 因为这种情况有专门的处理逻辑
      if (this.isNoReferenceAudioPlaying) {
        // console.log('🔄 检测到“未找到参考资料”音频结束，跳过常规音频结束处理');
        // 这里不直接return，让专门的监听器处理
        return;
      }

      // 停止视频播放
      this.stopPlayVideo();

      // 重置播放状态
      this.isPlaying = false;

      // 重置页面状态，回到等待状态
      if (this.pageStatus === 10 || this.pageStatus === 11) {
        this.pageStatus = -1; // 回到等待状态
        // console.log('📄 页面状态重置为等待状态');
      }

      // 确保交互状态为交互模式，允许用户继续提问
      if (this.interactiveStatus !== 1) {
        this.interactiveStatus = 1;
        // console.log('🔄 交互状态已重置为交互模式');
      }

      // 延迟清空当前问题和答案，让用户有时间看到完整的回答
      setTimeout(() => {
        if (!this.isPlaying) { // 再次确认没有新的播放开始
          // 🔧 修复：保持curQuestion的完整结构，包括refList等属性
          this.curQuestion = {
            question: '',
            answer: '',
            url: null,
            refList: [],
            originRefList: [],
            selectedIndex: -1
          };
          this.toTTSAnswer = '';
          // console.log('🧹 问题和答案已清空，准备接受新的交互');
        }
      }, 2000); // 延迟2秒清空

      console.log('✅ 音频播放结束处理完成，系统准备接受新的交互');
    },

    // 新增：停止视频播放的方法
    stopPlayVideo() {
      const videoPlayer = this.videoPlayer;
      if (videoPlayer) {
        if (!videoPlayer.paused) {
          videoPlayer.pause();
          // console.log('📹 视频播放已暂停');
        }

        // 重置视频到开始位置
        videoPlayer.currentTime = 0;
        // console.log('📹 视频已重置到开始位置');

        // 确保视频处于停止状态
        if (videoPlayer.readyState >= 2) { // HAVE_CURRENT_DATA
          videoPlayer.load(); // 重新加载视频，确保完全重置
        }
      }
    },

    // 新增：启动时初始化摄像头的方法
    initializeCameraOnStartup() {
      // console.log('🚀 开始初始化摄像头...')
      // console.log('当前状态:', {
      //   showCamera: this.showCamera,
      //   interactiveStatus: this.interactiveStatus,
      //   isCameraInit: this.isCameraInit,
      //   cameraIp: this.cameraIp,
      //   cameraPort: this.cameraPort
      // })

      // 确保在下一个tick中执行，让DOM完全渲染
      this.$nextTick(() => {
        // console.log('🚀 DOM已渲染，开始初始化摄像头和眼球跟踪')

        // 检查DOM元素是否存在
        const cameraPanel = this.$refs.cameraPanel;
        const overlay = this.$refs.overlay;
        // console.log('DOM元素检查:', {
        //   cameraPanel: !!cameraPanel,
        //   overlay: !!overlay,
        //   cameraPanelSize: cameraPanel ? `${cameraPanel.clientWidth}x${cameraPanel.clientHeight}` : 'null'
        // })

        // 先调整Canvas尺寸
        this.resizeCanvas()

        // 设置窗口置顶（因为现在是交互状态）
        ipcRenderer.send('window-set-always-on-top', true);

        // 初始化摄像头相关设置 - 注意：不要在这里设置isCameraInit为true
        // 让setupVideoClient自己管理这个状态

        // 延迟一点时间确保canvas等元素已经准备好，然后建立视频连接
        setTimeout(() => {
          // console.log('📹 开始建立视频连接...')
          this.setupVideoClient()
        }, 500)
      })
    },

    login() {
      this.$store.dispatch('login')
    },
    // 定期清理过期的眼球状态记录 - 优化版本
    cleanExpiredEyeStates() {
      const now = Date.now();

      // 缩短长时间未更新的阈值，从2秒改为1秒
      if (now - this.eyeLastUpdateTime > 1000) {
        this.eyeIsDirectly = false;
        this.canInteract = false;
        this.eyeStateRecords = [];
        this.headPoseRecords = [];
        // console.log('⏰ 眼球状态超时重置');
        return;
      }

      // 移除过期的眼球状态记录
      this.eyeStateRecords = this.eyeStateRecords.filter(
        record => now - record.timestamp <= this.eyeStateDuration
      );

      // 移除过期的头部姿态记录
      this.headPoseRecords = this.headPoseRecords.filter(
        record => now - record.timestamp <= this.headPoseDuration
      );

      // 重新计算眼球状态
      this.updateEyeDirectlyStatus();

      // 综合判定交互状态
      this.updateInteractionStatus();
    },

    // 优化：更新眼球正视状态 - 支持快速恢复
    updateEyeDirectlyStatus() {
      if (this.eyeStateRecords.length === 0) {
        return;
      }

      const centerRecords = this.eyeStateRecords.filter(record => record.isCenter);
      const centerRatio = centerRecords.length / this.eyeStateRecords.length;

      // 动态阈值：记录较少时使用更宽松的条件，帮助用户快速获得交互能力
      let threshold = this.eyeStateThreshold; // 默认0.65
      if (this.eyeStateRecords.length <= 4) {
        threshold = 0.5; // 记录少时降低到50%
      } else if (this.eyeStateRecords.length <= 6) {
        threshold = 0.6; // 记录中等时降低到60%
      }

      // 状态变化逻辑：更容易变为true，更难变为false（增加稳定性）
      if (!this.eyeIsDirectly) {
        // 当前为false，需要达到动态阈值才能变为true
        if (centerRatio >= threshold) {
          this.eyeIsDirectly = true;
          // console.log(`👁️ 眼球正视: ${centerRatio.toFixed(2)} >= ${threshold}`);

          // 新增：眼球正视时自动触发交互准备
          this.onEyeDirectlyDetected();
        }
      } else {
        // 当前为true，需要低于50%才变为false（更难失去正视状态）
        if (centerRatio < 0.5) {
          this.eyeIsDirectly = false;
          // console.log(`❌ 眼球偏离: ${centerRatio.toFixed(2)} < 0.5`);
        }
      }
    },

    // 新增：综合判定交互状态
    updateInteractionStatus() {
      const now = Date.now();

      // 限制检查频率，避免过于频繁的状态变化
      if (now - this.lastInteractCheck < this.interactCheckInterval) {
        return;
      }
      this.lastInteractCheck = now;

      // 综合判定：眼球正视 + 头部姿态合适
      // 🔧 优化：合理的头部姿态要求，既不太严格也不太宽松
      let headPoseThreshold = this.headPoseThreshold; // 默认0.7
      if (this.headPoseRecords.length <= 3) {
        headPoseThreshold = 0.5; // 记录很少时降低到50%
      } else if (this.headPoseRecords.length <= 5) {
        headPoseThreshold = 0.6; // 记录中等时降低到60%
      } else {
        headPoseThreshold = 0.65; // 记录充足时保持适中的65%
      }

      const hasValidHeadPose = this.headPoseRecords.length === 0 ||
        (this.headPoseRecords.filter(record => record.isFrontal).length / this.headPoseRecords.length) >= headPoseThreshold;

      // 【临时修改】简化逻辑：只要头部姿态合理就可以交互，不再依赖eyeIsDirectly
      // 原逻辑：const newCanInteract = this.eyeIsDirectly && hasValidHeadPose;
      const newCanInteract = hasValidHeadPose;

      if (newCanInteract !== this.canInteract) {
        this.canInteract = newCanInteract;
        // console.log(`🔄 交互状态: ${this.canInteract ? '可交互' : '不可交互'}`);

        // 如果刚刚变为可交互状态，记录一下
        if (this.canInteract && this.sdkStatus === 1) {
          console.log('🎯 用户可进行语音交互');
        }
      }
    },
    // 开启监听worker通知
    setupWorkerNotify() {
      ipcRenderer.on('message-from-worker', (event, args) => {
        // 🔧 修复：某些消息即使在非交互模式也需要处理
        const alwaysProcessTypes = ['irisWorkerResetComplete', 'irisWorkerResetFailed', 'irisWorkerResetProgress', 'garbageCollectionComplete', 'healthStatus', 'irisError'];

        if (this.interactiveStatus === 2 && !alwaysProcessTypes.includes(args.type)) {
          // 非交互模式，但允许处理重要的状态更新消息
          return
        }
        // console.log('renderer收到worker线程通知', args)
        if (args.type === 'error') {
          this.errorInfo = args.data
        } else {
          // 对于所有语音相关的消息，都需要检查眼球正视状态
          const isVoiceRelated = ['asr', 'awake', 'vad_start', 'nlp', 'vad_finish', 'cbm_tidy'].includes(args.type);

          if (isVoiceRelated && !this.canInteract) {
            // console.log(`❌ 拒绝处理语音消息 ${args.type}: 用户未正视摄像头`);
            return; // 直接返回，不处理任何语音相关消息
          }

          if (args.type === 'asr') {
            // 语音识别结果 - 需要眼球正视
            this.srSuccess(args.data, args.isLast)
          } else if (args.type === 'videoFrame') {
            // 视频数据
            this.drawVideoFrame(args.data)
          } else if (args.type === 'awake') {
            // 唤醒 - 需要眼球正视
            this.sdkStatusCallback(3, null, false)
          } else if (args.type === 'vad_start') {
            // 语音活动检测开始 - 需要眼球正视
            if (this.sdkStatus === 1) {
              this.sdkStatusCallback(3, null, false)
            }
          } else if (args.type === 'sleep') {
            this.sdkStatusCallback(1, null, true)
          } else if (args.type === 'nlp') {
            // 自然语言处理 - 需要眼球正视
            this.sdkStatusCallback(4, args.data, args.isLast)
          } else if (args.type === 'vad_finish') {
            // 语音活动检测结束 - 需要眼球正视
            this.sdkStatusCallback(4, args.data, true)
          } else if (args.type === 'cbm_tidy') {
            // 语音整理 - 需要眼球正视
            this.sdkStatusCallback(4, args.data, args.isLast)
          } else if (args.type === 'ip') {
            // console.log('📍 收到摄像头IP地址:', args.data)
            // 移除条件限制，始终更新IP地址
            this.cameraIp = args.data
            // console.log('📍 摄像头IP已更新为:', this.cameraIp)
          } else if (args.type === 'irisResult') {
            if (args && args.data) {
              try {
                const resultData = JSON.parse(args.data);
                const positionEye = resultData.position;
                const headPose = resultData.headPose; // 新增头部姿态信息
                const timestamp = args.timestamp || Date.now();
                const now = Date.now();

                // 缩短过期时间：从800ms改为500ms，提高实时性要求
                if (now - timestamp > 500) {
                  // console.log('收到过期的眼球数据，忽略');
                  return;
                }

                // 数据质量检查
                if (!positionEye || typeof positionEye !== 'object') {
                  this.eyeIsDirectly = false;
                  this.canInteract = false;
                  return;
                }

                // 更新上次接收时间
                this.eyeLastUpdateTime = now;
                this.lastIrisDataReceiveTime = now;

                // 判断当前眼球状态 - 增加更严格的判断
                const isBothCenter = positionEye.left === 'CENTER' && positionEye.right === 'CENTER';
                const isEyeValid = positionEye.left !== 'Closed' && positionEye.right !== 'Closed';

                // 添加眼球状态记录
                this.eyeStateRecords.push({
                  isCenter: isBothCenter && isEyeValid,
                  isValid: isEyeValid,
                  leftEye: positionEye.left,
                  rightEye: positionEye.right,
                  timestamp: timestamp
                });

                // 处理头部姿态信息
                if (headPose && typeof headPose === 'object') {
                  const { pitch, yaw, roll } = headPose;
                  // 🔧 调整头部姿态判断条件：适中的容忍度，既不太严格也不太宽松
                  const isFrontal = Math.abs(yaw) <= 20 && Math.abs(pitch) <= 15 && Math.abs(roll) <= 20;

                  this.headPoseRecords.push({
                    isFrontal: isFrontal,
                    pitch: pitch,
                    yaw: yaw,
                    roll: roll,
                    timestamp: timestamp
                  });

                  if (process.env.NODE_ENV === 'development') {
                    const status = isFrontal ? '✅合格' : '❌偏离';
                    console.log(`头部姿态检查: yaw=${yaw.toFixed(1)}°, pitch=${pitch.toFixed(1)}°, roll=${roll.toFixed(1)}°, 状态=${status}`);
                  }

                  // 限制头部姿态记录数量
                  if (this.headPoseRecords.length > this.headPoseMaxRecords) {
                    this.headPoseRecords.shift();
                  }
                }

                // 保持眼球状态记录数量不超过最大值
                if (this.eyeStateRecords.length > this.eyeStateMaxRecords) {
                  this.eyeStateRecords.shift();
                }

                // 过滤出时间窗口内的有效记录
                const validEyeRecords = this.eyeStateRecords.filter(
                  record => now - record.timestamp <= this.eyeStateDuration && record.isValid
                );

                // 如果没有有效记录，设为false
                if (validEyeRecords.length === 0) {
                  this.eyeIsDirectly = false;
                  this.canInteract = false;
                  return;
                }

                // 计算CENTER状态的比例 - 基于有效记录
                const centerCount = validEyeRecords.filter(record => record.isCenter).length;
                const centerRatio = centerCount / validEyeRecords.length;

                // 更新眼球状态
                this.updateEyeDirectlyStatus();

                // 更新综合交互状态
                this.updateInteractionStatus();

                // 详细日志输出
                // console.log(`眼球分析: 中心比例=${centerRatio.toFixed(2)}/${this.eyeStateThreshold}, ` +
                //   `正视=${this.eyeIsDirectly}, 可交互=${this.canInteract}, 有效记录=${validEyeRecords.length}/${this.eyeStateRecords.length}`);

              } catch (error) {
                // console.error('处理眼球状态数据出错:', error);
                this.eyeIsDirectly = false;
                this.canInteract = false;
              }
            } else {
              // 数据为空，设为false
              this.eyeIsDirectly = false;
              this.canInteract = false;
            }
          } else if (args.type === 'irisError') {
            console.error('🔴 人脸检测错误:', args.data);

            // 检查错误详情
            const errorData = args.data || '';
            let shouldReset = false;

            if (typeof errorData === 'object') {
              // 详细错误信息
              console.log('错误详情:', {
                message: errorData.message,
                timestamp: errorData.timestamp,
                memoryUsage: errorData.memoryUsage
              });

              // 检查是否是严重的错误需要重置
              const criticalErrors = [
                '图像加载超时',
                '图像加载失败',
                '无效的图像尺寸',
                '无法提取眼部坐标',
                'faceLandmarker未加载'
              ];

              shouldReset = criticalErrors.some(error =>
                errorData.message && errorData.message.includes(error)
              );

              // 内存使用检查
              if (errorData.memoryUsage) {
                const heapUsed = errorData.memoryUsage.heapUsed || 0;
                const heapTotal = errorData.memoryUsage.heapTotal || 0;
                const memoryRatio = heapUsed / heapTotal;

                if (memoryRatio > 0.9) {
                  console.warn('⚠️ 内存使用率过高:', (memoryRatio * 100).toFixed(1) + '%');
                  shouldReset = true;
                }
              }
            } else if (typeof errorData === 'string') {
              // 简单错误信息
              shouldReset = errorData.includes('内存') ||
                errorData.includes('超时') ||
                errorData.includes('失败') ||
                errorData === 'worker窗口不存在';
            }

            if (shouldReset) {
              console.log('🚨 检测到严重错误，启动恢复流程');

              // 立即请求垃圾回收
              this.sendMsgToMain('window-message-from-renderer', {
                type: 'garbageCollection',
                timestamp: Date.now()
              });

              // 延迟请求重置worker
              setTimeout(() => {
                console.log('🔄 请求重置iris worker');
                this.sendMsgToMain('window-message-from-renderer', {
                  type: 'resetWorker',
                  timestamp: Date.now()
                });
              }, 2000);
            }

            // 暂时禁用眼球检测
            this.eyeIsDirectly = false;
            this.canInteract = false;
          } else if (args.type === 'healthStatus') {
            console.log('📊 iris worker健康状态:', args.data);
            
            // 更新最后健康检查时间
            this.lastIrisDataReceiveTime = Date.now();
            
            // 多维度健康检查
            const health = args.data;
            let needsReset = false;
            let resetReason = '';
            
            if (!health.modelLoaded) {
              needsReset = true;
              resetReason = '模型未加载';
            } else if (health.consecutiveErrors >= 5) {
              needsReset = true;
              resetReason = `连续错误过多(${health.consecutiveErrors}次)`;
            } else if (health.timeSinceLastProcess > 60000) {
              needsReset = true;
              resetReason = `长时间无响应(${Math.round(health.timeSinceLastProcess/1000)}秒)`;
            } else if (health.averagePerformance > 5000) {
              needsReset = true;
              resetReason = `性能严重下降(平均${health.averagePerformance}ms)`;
            } else if (!health.isHealthy) {
              needsReset = true;
              resetReason = '综合健康评估失败';
            }
            
            if (needsReset) {
              console.warn(`⚠️ iris worker需要重置: ${resetReason}`);
              console.log('🔧 详细健康状态:', {
                模型加载: health.modelLoaded,
                连续错误: health.consecutiveErrors,
                最后处理: `${Math.round(health.timeSinceLastProcess/1000)}秒前`,
                平均性能: `${health.averagePerformance}ms`,
                处理总数: health.processCount
              });
              
              this.sendMsgToMain('window-message-from-renderer', {
                type: 'resetWorker',
                timestamp: Date.now(),
                reason: resetReason
              });
            } else {
              console.log(`✅ iris worker健康状况良好 - 处理${health.processCount}次, 平均${health.averagePerformance}ms`);
            }
            
            // 根据健康状态动态调整检查频率
            this.adjustHealthCheckFrequency(health.isHealthy);
          } else if (args.type === 'garbageCollectionComplete') {
            console.log('✅ iris worker垃圾回收完成');
          } else if (args.type === 'irisWorkerResetComplete') {
            console.log('✅ 收到iris worker重置完成通知，模型状态:', args.data);

            // 重置完成后，重新初始化眼球跟踪状态
            const now = Date.now();
            this.eyeLastUpdateTime = now;
            this.lastIrisDataReceiveTime = now;  // 重要：重置数据接收时间
            this.eyeStateRecords = [];
            this.headPoseRecords = [];
            this.eyeIsDirectly = false;
            this.canInteract = false;

            console.log('🎯 iris worker重置完成，状态已初始化，时间戳:', now);

            // 重置成功，清零重试计数器
            this.irisResetRetryCount = 0;
            console.log('🔄 重置成功，重试计数器已清零');

            // 确保模型已加载
            if (args.data && args.data.modelLoaded) {
              console.log('🎯 模型重新加载成功，眼球跟踪已重新启动');
            } else {
              console.warn('⚠️ 模型可能未正确加载');
            }
          } else if (args.type === 'irisWorkerResetFailed') {
            console.error('❌ iris worker重置失败:', args.data);

            // 解析错误信息，判断重试策略
            const errorData = args.data;
            let shouldRetry = true;
            let retryDelay = 10000; // 默认10秒

            if (typeof errorData === 'object') {
              console.error('重置失败详情:', {
                message: errorData.message,
                errorType: errorData.errorType,
                timestamp: errorData.timestamp
              });

              // 根据错误类型调整重试策略
              if (errorData.message && errorData.message.includes('超时')) {
                retryDelay = 15000; // 超时错误延长到15秒
                console.log('🕐 检测到超时错误，延长重试间隔到15秒');
              } else if (errorData.message && errorData.message.includes('模型')) {
                retryDelay = 20000; // 模型加载错误延长到20秒
                console.log('🤖 检测到模型加载错误，延长重试间隔到20秒');
              }
            }

            // 检查重试次数（简单的计数器）
            if (!this.irisResetRetryCount) {
              this.irisResetRetryCount = 0;
            }

            this.irisResetRetryCount++;
            console.log(`🔢 iris worker重置重试次数: ${this.irisResetRetryCount}/3`);

            if (this.irisResetRetryCount >= 3) {
              console.error('❌ iris worker重置重试次数已达上限，停止自动重试');
              console.error('💡 建议手动刷新页面或重启应用');

              // 显示用户友好的错误信息
              this.errorInfo = 'iris worker重置失败，请刷新页面或重启应用';
              this.eyeIsDirectly = false;
              this.canInteract = false;
              shouldRetry = false;
            }

            if (shouldRetry) {
              console.log(`🔄 将在${retryDelay / 1000}秒后尝试第${this.irisResetRetryCount}次重置`);
              setTimeout(() => {
                console.log(`🔄 开始第${this.irisResetRetryCount}次iris worker重置重试`);
                this.sendMsgToMain('window-message-from-renderer', {
                  type: 'resetWorker',
                  timestamp: Date.now(),
                  retryAttempt: this.irisResetRetryCount
                });
              }, retryDelay);
            }
          } else if (args.type === 'irisWorkerResetProgress') {
            // 处理重置进度通知
            console.log('🔄 iris worker重置进度:', args.data);
            if (args.data && args.data.message) {
              console.log(`📊 ${args.data.stage}: ${args.data.message}`);
            }
          }
          this.errorInfo = null
        }
      })
    },

    // 初始化录
    initRecorder() {
      this.streamAudioPlayer = new AnceStreamAudioPlayer(this.startPlayVideo, this.ttsPlayStop)
      let that = this
      this.audioPlayer.addEventListener('ended', function () {
        console.info('-----audio end----')
        if (that.needStartVad) {
          // 检查眼球正视状态
          if (that.canInteract) {
            that.sdkStatusCallback(3, null, false)
          } else {
            console.log('❌ 音频结束拒绝VAD: 用户未正视摄像头');
          }
          that.needStartVad = false
        }
        that.videoPlayer.pause()
      })
      this.videoPlayer.addEventListener('play', function () {
        that.isPlaying = true
        console.info('-----video play----', that.isPlaying)
      })
      this.videoPlayer.addEventListener('pause', function () {
        that.isPlaying = false
        that.videoPlayer.load()
        console.info('-----video pause----', that.isPlaying)
      })
      this.videoPlayer.addEventListener('error', function (event) {
        that.isPlaying = false
        that.startPlayVideo()
        let error = event.target.error
        console.info('-----video error----', error)
        switch (error.code) {
          case error.MEDIA_ERR_ABORTED:
            console.info('-----视频加载被中止！----')
            break;
          case error.MEDIA_ERR_NETWORK:
            console.info('-----网络错误导致视频加载失败！----')
            break;
          case error.MEDIA_ERR_DECODE:
            console.info('-----视频解码失败！----')
            break;
          case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
            console.info('-----不支持的视频格式！----')
            break;
          default:
            console.info('-----未知错误发生！！----')
            break;
        }
      })
    },

    // sdk状态处理函数
    sdkStatusCallback(sdkState, data, isSrEnded) {
      console.log(`----sdkStatus old ${this.sdkStatus} -> new ${sdkState}`)

      // 对于语音识别相关的状态变化，需要检查眼球正视
      if ([3, 4].includes(sdkState) && !this.canInteract) {
        console.log(`❌ 拒绝SDK状态变化 ${sdkState}: 用户未正视摄像头`);
        return; // 不处理语音识别相关的状态变化
      }

      this.sdkStatus = sdkState
      switch (sdkState) {
        case 1:
          if (this.pageStatus === 7) {
            // 🔧 修复：文件选择阶段需要检查眼球正视状态，但放宽条件
            console.log('🔍 SDK回调-文件选择阶段状态:', {
              canInteract: this.canInteract,
              eyeIsDirectly: this.eyeIsDirectly,
              retryTimes: this.retryTimes
            });

            // 【临时修改】简化逻辑：只检查canInteract，不再检查eyeIsDirectly
            // 原逻辑：if (!this.canInteract && !this.eyeIsDirectly)
            if (!this.canInteract) {
              console.log('❌ 文件选择阶段SDK回调拒绝处理: 用户头部姿态不合适');
              return;
            }
            this.retryTimes += 1
            if (this.retryTimes >= 3) {
              this.asrSelectIndex(1)
              this.retryTimes = 0
            }
          } else {
            if (this.curSrResult.length > 0) {
              // 这里也需要检查眼球正视状态
              if (this.canInteract) {
                console.log(`🔄 SDK回调触发srSuccess, pageStatus: ${this.pageStatus}, curSrResult: ${this.curSrResult}`)
                this.srSuccess(this.curSrResult, true)
              } else {
                console.log('❌ SDK回调拒绝处理语音: 用户未正视摄像头');
                this.curSrResult = ""; // 清空识别结果
              }
            }
          }
          // this.changeSRStatus(false)
          break;
        case 2:
          // 唤醒成功
          // this.wakenSuccessHandler()
          break;
        case 3:
          // 语音识别中
          // this.changeSRStatus(true)
          break;
        case 4:
          // 语音识别成功
          this.srSuccess(data, isSrEnded)
          // if (isSrEnded) {
          //   this.changeSRStatus(false)
          // }
          break;
        case 5:
          // this.changeSRStatus(false)
          break;
        default:
          break;
      }
    },

    // ---------------- 语音检测  ----------------
    // 获取语音识别结果
    srSuccess(singleResult, isEnded) {
      console.log(`🎤 语音识别: ${singleResult}, 完成: ${isEnded}`)

      // 最终的安全检查：无论通过什么路径到达这里，都必须检查眼球正视
      if (!this.canInteract) {
        console.log(`❌ 拒绝语音: 用户未正视摄像头`);
        return;
      }

      // 检查输入参数
      if ("" === singleResult || null == singleResult) {
        return
      }
      this.stopEndMsgTimer()

      if (!isEnded) {
        // 未完成识别
        this.curSrResult = singleResult
        this.endMsgTimer = setTimeout(() => {
          this.sdkStatusCallback(4, this.curSrResult, true)
        }, 2500)
        return
      }

      const currentTimestamp = Date.now()
      const interval = currentTimestamp - this.lastReceiveTimestamp
      if (this.lastIatMsg && singleResult === this.lastIatMsg && interval < this.MSG_INTERVAL) {
        console.log(`🔄 重复消息，丢弃`)
        this.lastIatMsg = singleResult
        this.lastReceiveTimestamp = currentTimestamp
        return
      }
      this.lastIatMsg = singleResult
      this.lastReceiveTimestamp = currentTimestamp
      // 2025.7.11
      if (this.preMsgs.length > 0) {
        // const msg = this.preMsgs.pop()
        // singleResult = msg + "," + singleResult
        // 只取最近的问题 进行拼接
        const recentMsg = this.preMsgs[this.preMsgs.length - 1]
        singleResult = recentMsg + "，" + singleResult
      }
      this.curSrResult = singleResult
      let result = singleResult

      // 判断页面状态，若是获取参考资料成功，则识别出的语音匹配参考资料列表序号
      if (this.pageStatus === 7) {

        // 【临时修改】简化逻辑：只检查canInteract，不再检查eyeIsDirectly
        // 原逻辑：if (!this.canInteract && !this.eyeIsDirectly)
        if (!this.canInteract) {
          console.log('❌ 文件选择需要合适的头部姿态');
          return;
        }

        let selectedRefIndex = -1

        // 1 找出语音识别结果中的阿拉伯数字（提取第一个数字）
        const numberMatch = result.match(/\d+/)  // 匹配第一个连续的数字
        if (numberMatch) {
          selectedRefIndex = parseInt(numberMatch[0])
          console.log(`📝 选择序号: ${selectedRefIndex}`)
          this.asrSelectIndex(selectedRefIndex)
          return
        }

        // 2 找出语音识别结果中汉字中的数词（优先匹配更长的表达）
        const sortedKeys = Object.keys(this.chnNumberChar).sort((a, b) => b.length - a.length)

        for (let key of sortedKeys) {
          let index = result.indexOf(key)
          if (index !== -1) {
            selectedRefIndex = this.chnNumberChar[key]
            console.log(`📝 选择序号: ${selectedRefIndex} (${key})`)
            break;
          }
        }
        if (selectedRefIndex === -1) {
          this.retryTimes += 1
          if (this.retryTimes >= 3) {
            console.log(`❌ 重试超限，选择第一个文件`)
            this.asrSelectIndex(1)
            this.retryTimes = 0
          } else {
            console.log(`❌ 未识别序号，重试: ${this.retryTimes}`)
            this.playChooseRefAudio()
          }
          return
        }
        this.asrSelectIndex(selectedRefIndex)
        return
      }

      // 🔒 重要安全检查：如果当前正在显示文件列表（pageStatus 7-8），不应该创建新问题
      if (this.pageStatus >= 7 && this.pageStatus <= 8) {
        console.log(`🔒 文件选择中，忽略新问题`)
        return
      }

      // let index = this.qaList.findIndex(item => item.question === result)
      const isExist = this.curQuestion && this.curQuestion.question === result
      if (isExist) {
        console.log('🔄 重复问题，忽略')
        return
      }

      this.handlePageStatus()

      // 🔧 修复：立即清空旧问题的显示，避免新旧问题重叠
      this.curQuestion = { "question": "", "answer": "", "url": null, refList: [], originRefList: [], selectedIndex: -1 }

      // 完全重置流式TTS状态
      this.stopStreamTTSTimer(false) // 不发送剩余内容
      this.resetStreamText()
      this.toTTSAnswer = ""
      this.showAnswer = ""
      this.showedIndex = 0
      this.textDisplayCompleted = false // 重置文本展示完成标记
      this.sendedLength = 0
      this.lastStreamTime = null // 重置流式数据时间戳

      console.log('🆕 新问题开始，已完全重置流式状态')

      this.pageStatus = 3

      // 🔧 修复：在设置新问题时，清理之前可能存在的"未找到参考资料"音频监听器
      this.clearNoReferenceAudioEndCallback()
      this.isNoReferenceAudioPlaying = false

      let qa = { "question": result, "answer": "", "url": null, refList: [], originRefList: [], selectedIndex: -1 }
      console.log(`🆕 新问题: ${result}`)
      this.curQuestion = qa
      // this.showQuestionBox = true
      // 删除：在语音交互过程中不应该显示"点我提问"按钮
      // this.showAskQuestion = true

      // 2025.7.9 修改
      // 1 意图识别   2 获取参考资料  3 选择参考资料   4 获取答案
      this.stepIntentRecognize(result)
    },

    // 意图识别
    stepIntentRecognize(question) {
      // 请求参考文件列表
      let param = { 'question': question }
      let that = this

      intent_recognize(param, this).then(res => {
        this.curSrResult = ""
        let resObj = JSON.parse(res.data)
        console.info('意图识别结果:', resObj)

        // 检查问题是否清晰
        if (resObj.is_clear === 1) {
          // 问题是清晰的，检查意图类型
          this.pageStatus = 4
          const intent = resObj.intent
          const query = resObj.query

          console.info(`问题清晰，意图类型: ${intent}, query: ${query}`)

          if (intent === '1') {
            // 查询系统功能 - 直接返回query内容，不走文档查询流程
            console.info('系统功能查询，直接返回答案')
            this.pageStatus = 10 // 设置为获取答案成功状态
            this.curQuestion.answer = query
            this.toTTSAnswer = query
            this.startStreamTTSTimer()
            this.fakeStreamText(false)
          } else if (intent === '2') {
            // 其他功能 - 走获取文档的逻辑
            console.info('其他功能查询，走文档检索流程')
            let processedQuery = query.replace(/\s+/g, "")
            that.stepGetRefDocList(processedQuery)
          } else {
            // 未知意图类型，默认走文档查询
            console.warn('未知意图类型，默认走文档查询流程')
            let processedQuery = query.replace(/\s+/g, "")
            that.stepGetRefDocList(processedQuery)
          }
        } else {
          // 问题不清晰 (is_clear === 0) - 记录之前的问题，语音反馈，语音结束后，主动切换到交互模式，进行语音识别
          console.info('问题不清晰，需要用户补充信息')
          this.pageStatus = 5
          const feedback = resObj.query
          this.toTTSAnswer = feedback
          this.curQuestion.answer = feedback
          this.startStreamTTSTimer()
          this.fakeStreamText(false)
          // 限制历史问题数量
          this.preMsgs.push(question)
          if (this.preMsgs.length > this.maxPreMsgsCount) {
            this.preMsgs.shift() // 移除最旧的
          }
          this.resetPreMsgsTimeout()
        }
      }).catch(error => {
        // // 处理401错误
        // if (error.response && error.response.status === 401) {
        //   const errorMsg = error.response.data?.error || '';
        //   // 使用正则表达式匹配错误信息，允许任意空格变化
        //   if (/timestamp\s+is\s+not\s+pass/.test(errorMsg)) {
        //     this.errorInfo = '会话已过期，请重新登录';
        //   } else {
        //     this.errorInfo = '认证失败，请检查登录状态';
        //   }
        // } else {
        //   this.errorInfo = '网络请求失败，请稍后重试';
        // }
        console.log("这里是执行网络错误的")
        this.curQuestion = { "question": "", "answer": "", "url": null, refList: [], originRefList: [], selectedIndex: -1 }
        // this.askQuestionClick()
      })

    },
    // 重置历史问题超时
    resetPreMsgsTimeout() {
      if (this.preMsgsTimeout) {
        clearTimeout(this.preMsgsTimeout)
      }
      this.preMsgsTimeout = setTimeout(() => {
        console.log('历史问题超时，清空preMsgs')
        this.preMsgs = []
      }, this.preMsgsTimeoutDuration)
    },
    // 2 获取参考资料
    stepGetRefDocList(question) {
      this.pageStatus = 6
      let that = this
      get_ref_doc_list({ 'question': question }, this).then((res) => {
        that.pageStatus = 7
        that.toTTSAnswer = ""
        that.lastStreamTime = null
        let data = JSON.parse(res.data)
        console.info('去重前：', data)
        if (data && data instanceof Array && data.length > 0) {
          that.interactiveStatus = 1
          // 处理
          that.curQuestion.originRefList = data
          // 播放请求
          that.playChooseRefAudio()

          // 过滤，得到不重复的文件名
          let itemList = []
          data.forEach(ref => {
            let index = itemList.findIndex(name => ref.fileName === name.fileName)
            if (index === -1) {
              itemList.push(ref)
            }
          })
          that.curQuestion.refList = itemList
          console.info('📋 === 设置refList成功 ===')
          console.info('📋 refList长度:', itemList.length)
          console.info('📋 refList内容:', itemList)
          console.info('📋 当前curQuestion:', JSON.parse(JSON.stringify(that.curQuestion)))
        } else {
          // 注释原有逻辑：直接在当前对话基础上继续
          /*
          that.pageStatus = 11
          that.curQuestion.refList = null
          that.curQuestion.originRefList = null
          that.curQuestion.answer = that.noAnswer
          that.toTTSAnswer = that.noAnswer
          that.startStreamTTSTimer()
          that.fakeStreamText(false)
          // 修改：保持交互状态，这样用户可以通过眼球正视继续提问
          // this.interactiveStatus = 2  // 注释掉这行，保持交互状态
          console.log('📝 未找到参考资料，但保持交互状态，用户可继续通过眼球正视提问');
          */

          // 新逻辑：重新开启新的对话流程
          console.log('📝 未找到参考资料，准备重新开启新的对话');
          that.handleNoReferenceFoundNewConversation();
        }
        that.curSrResult = ""
      }).catch((error) => {
        console.log(error)
        this.pageStatus = 8
      })
    },

    stopEndMsgTimer() {
      if (this.endMsgTimer) {
        clearTimeout(this.endMsgTimer)
        this.endMsgTimer = null
      }
    },

    asrSelectIndex(selectedRefIndex) {
      selectedRefIndex -= 1
      console.info('🎯 === asrSelectIndex 开始执行 ===')
      console.info('🎯 语音选择的文件序号是：', selectedRefIndex)
      console.info('🎯 当前 pageStatus:', this.pageStatus)
      console.info('🎯 当前 curQuestion 完整对象:', JSON.parse(JSON.stringify(this.curQuestion || {})))

      // 🔧 修复：文件选择方法检查眼球正视状态，放宽条件
      console.log('🔍 asrSelectIndex交互状态:', {
        canInteract: this.canInteract,
        eyeIsDirectly: this.eyeIsDirectly,
        selectedRefIndex: selectedRefIndex
      });

      // 【临时修改】简化逻辑：只检查canInteract，不再检查eyeIsDirectly
      // 原逻辑：if (!this.canInteract && !this.eyeIsDirectly)
      if (!this.canInteract) {
        console.error('❌ asrSelectIndex拒绝执行: 用户头部姿态不合适');
        console.log('💡 提示：请保持合适的头部姿态');
        return;
      }

      // 安全检查：确保refList存在且是数组
      if (!this.curQuestion || !this.curQuestion.refList || !Array.isArray(this.curQuestion.refList)) {
        console.error('❌ === refList检查失败 ===')
        console.error('❌ curQuestion 存在:', !!this.curQuestion)
        console.error('❌ refList 存在:', !!this.curQuestion?.refList)
        console.error('❌ refList 类型:', typeof this.curQuestion?.refList)
        console.error('❌ refList 是数组:', Array.isArray(this.curQuestion?.refList))
        console.error('❌ 完整 curQuestion:', this.curQuestion)

        // 尝试从模板中的数据源获取refList
        console.error('❌ 尝试从其他地方获取refList...')
        if (this.curQuestion && !this.curQuestion.refList) {
          console.error('❌ curQuestion存在但refList不存在，这很可能是数据被覆盖了')
        }

        this.playOutboundListAudio()
        return
      }

      console.info('✅ === refList检查通过 ===')
      console.info('✅ refList长度:', this.curQuestion.refList.length)
      console.info('✅ refList内容:', this.curQuestion.refList)

      if (selectedRefIndex >= 0 && selectedRefIndex < this.curQuestion.refList.length) {
        let selectedRow = this.curQuestion.refList[selectedRefIndex]
        console.info('✅ 选择的文件:', selectedRow)
        this.refListSelected(selectedRow)
      } else {
        console.info('❌ 选择的文件序号超出范围')
        console.info('❌ selectedRefIndex:', selectedRefIndex)
        console.info('❌ refList长度:', this.curQuestion.refList.length)
        this.playOutboundListAudio()
      }
      console.info('🎯 === asrSelectIndex 执行结束 ===')
    },

    // 🔧 调试方法：检查当前状态
    debugCurrentState() {
      console.log('🔧 === 当前状态调试 ===')
      console.log('🔧 pageStatus:', this.pageStatus)
      console.log('🔧 interactiveStatus:', this.interactiveStatus)
      console.log('🔧 curQuestion存在:', !!this.curQuestion)
      console.log('🔧 curQuestion:', JSON.parse(JSON.stringify(this.curQuestion || {})))
      console.log('🔧 refList存在:', !!this.curQuestion?.refList)
      console.log('🔧 refList长度:', this.curQuestion?.refList?.length || 0)
      console.log('🔧 refList内容:', this.curQuestion?.refList)
      return {
        pageStatus: this.pageStatus,
        curQuestion: this.curQuestion,
        refListExists: !!this.curQuestion?.refList,
        refListLength: this.curQuestion?.refList?.length || 0
      }
    },

    // 处理参考文件列表被选择
    refListSelected(currentRow) {
      // 🔧 修复：触屏选择文件不需要检查眼球正视状态，只有语音交互才需要
      console.log('📱 触屏选择文件，无需眼球正视检查');

      this.playWaitingAudio()
      this.originUrl = currentRow.url
      console.log('originUrl', this.originUrl)
      this.showOriginBtn = true
      this.curQuestion.selectedIndex = this.curQuestion.refList.findIndex(item => {
        return item.id === currentRow.id
      })

      // 传递的参数是文件名
      let title = currentRow.fileName
      if (title && title.length > 0) {
        this.pageStatus = 9
        // 删除：在获取答案过程中应该保持交互状态，不需要设置为非交互状态
        // this.interactiveStatus = 2
        // 🔧 新答案即将开始：完全重置流式TTS状态
        this.stopStreamTTSTimer(false) // 不发送剩余内容
        this.resetStreamText()
        this.sendedLength = 0
        this.toTTSAnswer = ''
        this.showedIndex = 0
        this.showAnswer = ''
        this.textDisplayCompleted = false // 重置文本展示完成标记
        this.lastStreamTime = null

        console.log('🆕 文献选择，开始新答案', {
          question: this.curQuestion ? this.curQuestion.question : '',
          title: title,
          pageStatus: this.pageStatus
        })
        console.log('🔁 已完全重置流式状态', {
          sendedLength: this.sendedLength,
          showedIndex: this.showedIndex,
          toTTSLen: this.toTTSAnswer.length
        })
        this.sendWSMessage(this.curQuestion.question, title)
      } else {
        console.info('未找到对应的参考文件')
      }
    },

    changeSRStatus(val) {
      this.isRecognizing = val
    },

    //------------ websocket 消息--------------
    sendWSMessage(content, refIds = null) {
      if (null == content || "" === content) {
        return
      }
      // 发送websocket消息
      let msg = {
        content: content,
        sender: this.userName,
        recipient: this.userName,
        sendTime: new Date(),
        fileType: 1,
        tts: false,   // 是否需要服务端的tts服务
        stream: true,
        title: refIds
        // refId: refIds
      }
      let websocketParam = JSON.stringify(msg)
      this.$ANCESocket.send(this, 'Audio', websocketParam, this.receiveWebsocketMsg)
    },

    receiveWebsocketMsg(message) {
      try {
        const data = JSON.parse(message.data)
        console.info('--websocket data---', data)
        if (this.pageStatus < 10) {
          this.pageStatus = 10
        }

        // 🔧 修复：确保curQuestion存在，如果不存在则创建
        if (!this.curQuestion) {
          // console.warn('⚠️ curQuestion为空，创建默认问题对象');
          this.curQuestion = {
            "question": "",
            "answer": "",
            "url": null,
            refList: [],
            originRefList: [],
            selectedIndex: -1
          };
        }

        // 答案的音频
        let qaItem = this.curQuestion
        if (data.fileType === 1) {
          if (!data.stream) {  // 非流式
            this.toTTSAnswer = data.content
            console.log('📥 收到非流式答案', { len: this.toTTSAnswer.length })
          } else {   // 流式
            // 简单直接的处理：直接追加内容，不进行复杂的新答案检测
            this.toTTSAnswer += data.content
            console.log('📥 收到流式片段', { add: data.content.length, total: this.toTTSAnswer.length })
          }
          // 将答案写回列表中
          if (qaItem) {
            qaItem.answer = this.toTTSAnswer
          }
          // 需要流式生成音频数据
          if (this.toTTSAnswer.length > 0) {
            this.startStreamTTSTimer()
          }
          // 生成假的流式效果
          this.fakeStreamText(false)
        } else if (data.fileType === 3) {
          if (qaItem) {
            qaItem.answer = data.content
            qaItem.url = data.fileUrl
          }
          // 播放语音
          this.updateAudioSrc(data.fileUrl, false, true)
        } else if (data.fileType === 5) {
          // 语音数据
          if (data.content) {
            const isLast = false
            this.streamAudioPlayer.receiveData(data.content, isLast)
          }
        }
        // console.info('--receiveWebsocketMsg qaList--', this.qaList)
      } catch (e) {
        this.pageStatus = 11
        console.error('WebSocket消息处理失败:', e)
      }
    },

    closeAnswerWebsocket() {
      console.info('主动关闭获取答案的websocket')
      this.$ANCESocket.close()
    },

    updateAudioSrc(url, isLocal, needStartVad = false, needReWakenSDK = false) {
      if (isLocal) {
        this.resultAudioUrl = require(`../assets/${url}`)
      } else {
        this.resultAudioUrl = process.env.VUE_APP_MINIO_URL + url
      }

      let that = this
      setTimeout(() => {
        that.needStartVad = needStartVad
        that.needReWaken = needReWakenSDK

        // 🔧 修复：确保音频完全加载后再播放，防止漏掉开头
        try {
          that.audioPlayer.load()

          // 等待音频可以播放时再开始播放
          const onCanPlay = () => {
            console.log('🔊 音频已加载，开始播放');

            const playPromise = that.audioPlayer.play()

            if (playPromise !== undefined) {
              playPromise.then(() => {
                console.log('🔊 音频播放成功');
                that.startPlayVideo()
              }).catch((error) => {
                console.warn('⚠️ 音频自动播放被阻止或失败:', error);
                // 不启动视频播放，等待用户交互
              });
            } else {
              that.startPlayVideo()
            }

            // 移除事件监听器，避免重复触发
            that.audioPlayer.removeEventListener('canplay', onCanPlay);
          };

          // 监听音频可以播放事件
          that.audioPlayer.addEventListener('canplay', onCanPlay);

          // 添加超时保护，防止音频加载失败时卡住
          setTimeout(() => {
            if (that.audioPlayer.readyState >= 2) { // 音频已经可以播放
              return; // 已经触发了canplay，不需要处理
            }

            console.warn('⚠️ 音频加载超时，尝试直接播放');
            that.audioPlayer.removeEventListener('canplay', onCanPlay);

            const playPromise = that.audioPlayer.play()
            if (playPromise !== undefined) {
              playPromise.then(() => {
                console.log('🔊 超时后音频播放成功');
                that.startPlayVideo()
              }).catch((error) => {
                console.warn('⚠️ 超时后音频播放失败:', error);
              });
            } else {
              that.startPlayVideo()
            }
          }, 2000); // 2秒超时

        } catch (error) {
          console.error('❌ 音频加载失败:', error);
        }
      }, 100) // 减少延迟时间，提高响应速度
    },

    ttsAudioStart() {
      if (this.pageStatus === 14) {
        this.disturbAnswering()
      } else {
        this.pageStatus = 13
        // 🔧 修复：添加小延迟确保音频已经开始播放，防止漏字
        setTimeout(() => {
          this.startPlayVideo()
        }, 100) // 100ms延迟，确保音频先开始
      }
    },

    startPlayVideo() {
      // 播放没有声音的mp4
      this.videoPlayerPromise = this.videoPlayer.play()
      if (this.videoPlayerPromise !== undefined) {
        this.videoPlayerPromise.then(() => {
        }).catch(e => {
          console.log(e)
        })
      }
    },

    ttsPlayStop() {
      if (this.preMsgs.length > 0) {
        // 之前问的问题不明确，需要补充信息，自动进入交互状态
        this.pageStatus = 5
        // 🔧 修复：不要设置为null，而是重置为默认结构
        this.curQuestion = {
          "question": "",
          "answer": "",
          "url": null,
          refList: [],
          originRefList: [],
          selectedIndex: -1
        }
        this.curSrResult = ""
        this.interactiveStatus = 1

        // 重要：重置SDK状态为未唤醒，确保下次必须通过眼球正视才能唤醒
        this.sdkStatus = 1
        console.log('意图识别失败后重置SDK状态，要求重新眼球正视唤醒');

        // 对于意图识别失败，不完全重置眼球状态，而是给用户快速恢复的机会
        // 只清空一半的记录，让用户更快重新获得交互能力
        const halfRecords = Math.ceil(this.eyeStateRecords.length / 2);
        this.eyeStateRecords = this.eyeStateRecords.slice(-halfRecords);

        const halfHeadRecords = Math.ceil(this.headPoseRecords.length / 2);
        this.headPoseRecords = this.headPoseRecords.slice(-halfHeadRecords);

        // 如果当前用户正在正视，保持eyeIsDirectly状态，但重置canInteract
        // 这样用户只需要短时间的正视就能重新获得交互能力
        this.canInteract = false;
        this.eyeLastUpdateTime = Date.now();
        this.lastInteractCheck = 0;

        // 立即触发一次状态更新检查，并且强制更新canInteract
        setTimeout(() => {
          this.updateEyeDirectlyStatus();
          this.updateInteractionStatus();

          // 【临时修改】简化快速恢复逻辑：基于头部姿态记录而不是eyeIsDirectly
          // 原逻辑：if (this.eyeIsDirectly && this.eyeStateRecords.length >= 2)
          if (this.headPoseRecords.length >= 2) {
            console.log('🚀 快速恢复: 用户头部姿态合适，允许交互');
            this.canInteract = true;
          }
        }, 100);

        // setTimeout(() => {
        //   this.interactiveStatus = 1
        // }, 500)
      } else {
        // 答案播报结束
        this.pageStatus = 14
      }

      this.videoPlayer.pause()
      this.stopStreamTTSTimer()
      this.fakeStreamText(true)
    },

    // ---------------网络检测-------------------
    setUpNetworkTimer() {
      ipcRenderer.on('network-status', (event, args) => {
        // console.info('Received network status:', args)
        this.isConnected = args
        this.$store.dispatch('changeNetworkStatus', args).then(() => { })
      });
    },

    // --------------- 语音唤醒-------------------
    playWakenAudio() {
      this.handlePageStatus()
      let wakenSrc = 'hello.mp3'
      this.updateAudioSrc(wakenSrc, true, true, false)
    },

    playWaitingAudio() {
      let waitingSrc = 'wait.mp3'
      this.updateAudioSrc(waitingSrc, true, false, true)
    },

    playChooseRefAudio() {
      let waitingSrc = 'ref.mp3'
      this.updateAudioSrc(waitingSrc, true, true, false)
    },

    playOutboundListAudio() {
      let waitingSrc = 'outboundlist.mp3'
      this.updateAudioSrc(waitingSrc, true, true, false)
    },

    //--------------------------流式tts---------------------------------

    foundLastSeperatorIndex(str) {
      // 定义匹配逗号、句号、回车符、换行符的正则表达式
      const regex = /[。！？.!?;；,，、:：\r\n]/g;
      let match;
      let lastIndex = -1;

      // 使用 exec 查找所有匹配项，更新最后一个匹配的位置
      while ((match = regex.exec(str)) !== null) {
        lastIndex = match.index;
      }

      return lastIndex
    },

    startStreamTTSTimer() {
      if (this.streamTTSTimer) return
      console.log(`🎵 启动TTS定时器: sended=${this.sendedLength}, total=${this.toTTSAnswer.length}`)

      this.streamTTSTimer = setInterval(() => {
        this.pageStatus = 12

        // 检查是否还有内容需要发送
        if (this.sendedLength >= this.toTTSAnswer.length) {
          console.log('⏱️ TTS已全部发送，停止定时器')
          this.stopStreamTTSTimer()
          return
        }

        // 简化的发送逻辑：每次发送固定长度的内容
        const chunkSize = 30 // 减少每次发送的字符数，确保更及时
        const endIndex = Math.min(this.sendedLength + chunkSize, this.toTTSAnswer.length)
        const sendText = this.toTTSAnswer.substring(this.sendedLength, endIndex)

        if (sendText.length > 0) {
          this.ttsWebsocket.send(this, 'Audio', sendText)
          this.sendedLength = endIndex
          console.log('🎙️ 已发送TTS片段', {
            progress: `${this.sendedLength}/${this.toTTSAnswer.length}`,
            text: sendText.slice(0, 20) + (sendText.length > 20 ? '...' : '')
          })
        }
      }, 1500) // 缩短间隔到1.5秒，提高发送频率
    },

    stopStreamTTSTimer(sendRemaining = true) {
      if (this.streamTTSTimer) {
        // 只有在正常结束时才发送剩余内容，重置时不发送
        if (sendRemaining && this.sendedLength < this.toTTSAnswer.length) {
          const remainingText = this.toTTSAnswer.substring(this.sendedLength)
          if (remainingText.trim().length > 0) {
            console.log('🎙️ 发送最后剩余内容', { remaining: remainingText.length })
            this.ttsWebsocket.send(this, 'Audio', remainingText)
            this.sendedLength = this.toTTSAnswer.length
          }
        }

        // 清理定时器和重置状态
        clearInterval(this.streamTTSTimer)
        this.streamTTSTimer = null
        this.sendedLength = 0
        console.log('🛑 TTS定时器已停止', { sendRemaining })
      }
    },

    closeTTSWebsocket() {
      console.info('主动关闭合成答案语音的websocket')
      this.ttsWebsocket.close()
    },

    resetStreamText() {
      this.showedIndex = 0
      this.showAnswer = ""
      this.textDisplayCompleted = false // 重置文本展示完成标记，恢复自动滚动
      if (this.streamTimer) {
        clearInterval(this.streamTimer)
        this.streamTimer = null
      }
    },

    // 前端实现的流式文字效果
    fakeStreamText(reset = false) {
      if (reset) {
        this.resetStreamText()
        console.log('🧹 文本展示定时器已重置')
      }
      if (this.showedIndex < this.toTTSAnswer.length && null == this.streamTimer) {
        this.resetStreamText()
        console.log('🖨️ 启动文本流式展示', { showedIndex: this.showedIndex, total: this.toTTSAnswer.length })
        this.streamTimer = setInterval(() => {
          let random = Math.random() * (8 - 3) + 3    // 产生 【3-8】之间的随机数
          let endIndex = Math.min(this.showedIndex + random, this.toTTSAnswer.length)
          const subString = this.toTTSAnswer.slice(this.showedIndex, endIndex)
          this.showAnswer += subString
          this.showedIndex = endIndex
          // 只在文本未展示完成时才自动滚动
          if (!this.textDisplayCompleted) {
            this.scrollToAnswerBottom()
          }
          if (this.showedIndex >= this.toTTSAnswer.length) {
            console.log('✅ 文本展示完成', { total: this.toTTSAnswer.length })
            this.textDisplayCompleted = true // 标记文本展示完成，停止自动滚动
          }
        }, 500)
      }
    },

    //------------------------- 打断正在回答的问题 -----------------------------------

    // 回答过程中被打断处理函数
    disturbAnswering() {
      console.info('----disturbAnswering----')
      this.pageStatus = 14   // 被打断视为已完成回答
      this.stopStreamTTSTimer()
      this.closeAnswerWebsocket()
      this.closeTTSWebsocket()
      this.fakeStreamText(true)
    },

    handlePageStatus() {
      // 判断status的状态
      if (this.pageStatus >= 9 && this.pageStatus < 14) {
        this.disturbAnswering()
      } else if (this.pageStatus === 6) {
        // 取消请求
        this.cancel('取消请求')

      } else if (this.pageStatus === 7) {
        this.curSrResult = null
      } else {
        this.showedIndex = 0
        this.showAnswer = ""
        this.toTTSAnswer = ""
        this.textDisplayCompleted = false // 重置文本展示完成标记
        this.sendedLength = 0
        this.lastStreamTime = null
      }
    },

    //---------------------- 摄像头 ------------------------------
    resizeCanvas() {
      this.$nextTick(() => {
        const container = this.$refs.cameraPanel;
        // console.log(`container`, container)
        if (container) {
          const canvas = this.$refs.overlay;

          // 🔧 修复：添加容器尺寸验证，防止异常的尺寸设置
          const containerWidth = container.clientWidth;
          const containerHeight = container.clientHeight;

          // 记录调试信息，便于追踪偶现问题
          if (process.env.NODE_ENV === 'development') {
            console.log(`📐 Canvas尺寸调整: ${containerWidth}x${containerHeight}`);
          }

          // 🔧 修复：只有在容器尺寸有效时才设置Canvas尺寸
          if (containerWidth > 0 && containerHeight > 0) {
            // 设置Canvas的固有属性
            canvas.width = containerWidth;
            canvas.height = containerHeight;
          } else {
            console.warn('⚠️ 容器尺寸异常，跳过Canvas尺寸设置:', {
              width: containerWidth,
              height: containerHeight
            });
          }
        }
      })
    },

    setupVideoClient() {
      console.log('📹 setupVideoClient 被调用:', {
        isCameraInit: this.isCameraInit,
        cameraIp: this.cameraIp,
        cameraPort: this.cameraPort
      })

      if (!this.isCameraInit) {
        console.log('📹 创建新的视频连接...')
        this.videoSocketClient = new VideoSocketClient(this.cameraIp, this.cameraPort)
        let that = this
        this.videoSocketClient.on('connectSuccess', () => {
          console.log('✅ 视频连接成功')
        })
        this.videoSocketClient.on('disconnect', () => {
          console.log('❌ 视频连接断开')
          that.clearVideoBitmap()
          that.errorInfo = "摄像头连接出错，请稍候再试。"
          that.interactiveStatus = 2
          that.isCameraInit = false
        })
        this.videoSocketClient.on('onFrameData', (videoData, frameFormat, frameW, frameH, frameDetect) => {

          // console.log(videoData, frameFormat, frameW, frameH, frameDetect,'摄像头返回的数据');
          // this.sendMsgToMain('window-message-from-renderer', { type: 'imageFromVideoToDetect', data: videoData })
          if (this.showCamera) {
            this.parseFrameData(videoData, frameFormat, frameW, frameH, frameDetect)
          }
        })
        console.log('📹 开始连接到摄像头...')
        this.videoSocketClient.connect()
      } else {
        console.log('📹 摄像头已经初始化过了')
      }
    },

    parseFrameData(data, format, width, height, frameDetect) {
      // 使用基础帧率限制 - 恢复到稳定的30fps
      const now = Date.now();
      if (this.lastFrameTime && now - this.lastFrameTime < 33) { // 恢复30fps（33ms间隔）
        return;
      }
      this.lastFrameTime = now;

      // 处理视频帧
      let bitmap = null;
      try {
        if (format === 0) {
          this.dataToBGRPixels(data, width, height);
          bitmap = this.createBitmapOptimized(width, height, this.pixels);
        } else if (format === 1) {
          bitmap = this.decodeBitmapOptimized(data);
        }

        if (bitmap) {
          if (frameDetect) {
            this.drawFaceRectangle(frameDetect, bitmap, width, height);
          }
          this.drawCanvasToScreen(bitmap, width, height);

          // 发送到irisWorker进行眼球检测
          const shouldSendToIris = this.shouldSendFrameToIris(now, frameDetect);
          if (shouldSendToIris) {
            this.lastIrisTime = now;
            this.sendMsgToMain('window-message-from-renderer', {
              type: 'imageFromVideoToDetect',
              data,
              timestamp: now,
              frameInfo: { width, height, format }
            });
          }
        }
      } catch (e) {
        console.error('处理视频帧出错:', e);
      }
    },

    // 新增：智能判断是否需要发送帧到iris检测
    shouldSendFrameToIris(now, frameDetect) {
      // 基础频率限制：恢复到适中的100ms一次（10fps）
      if (this.lastIrisTime && now - this.lastIrisTime < 100) {
        return false;
      }

      // 检查是否有人脸
      const hasFace = frameDetect && frameDetect.some(d => d && d.hasFace);
      if (!hasFace) {
        return false;
      }

      // 验证人脸信息的有效性
      const validFaceDetected = frameDetect.some(d => {
        if (d && d.hasFace && d.faceInfo) {
          const { faceX, faceY, faceW, faceH } = d.faceInfo;
          return faceW > 0 && faceH > 0 && faceX >= 0 && faceY >= 0;
        }
        return false;
      });

      if (!validFaceDetected) {
        return false;
      }

      // 如果状态稳定，适当降低检测频率
      if (this.eyeStateRecords.length >= 3) {
        const recentStates = this.eyeStateRecords.slice(-3);
        const allSame = recentStates.every(record => record.isCenter === recentStates[0].isCenter);

        if (allSame) {
          // 状态稳定时，降低到每300ms检测一次
          return !this.lastIrisTime || now - this.lastIrisTime > 300;
        }
      }

      return true;
    },

    dataToBGRPixels(data, width, height) {
      // 1. 画人脸框 (BGR 格式处理)
      let convert = data;

      // 初始化像素数组
      if (!this.pixels || this.pixels.length !== width * height) {
        this.pixels = new Uint32Array(width * height);
      }

      // 转换像素数组从 BGR 到 ARGB
      for (let i = 0; i < height; i++) {
        const offset = i * width * 3;
        const colorOffset = i * width;
        for (let j = 0; j < width; j++) {
          const blue = convert[offset + j * 3] & 0xff;
          const green = convert[offset + j * 3 + 1] & 0xff;
          const red = convert[offset + j * 3 + 2] & 0xff;
          this.pixels[colorOffset + j] = (0xff << 24) | (red << 16) | (green << 8) | blue;
        }
      }
    },
    // 优化的bitmap创建方法
    createBitmapOptimized(width, height, pixels) {
      if (!this.offscreenCanvas) {
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
      }

      // 只在必要时调整尺寸
      if (this.offscreenCanvas.width !== width || this.offscreenCanvas.height !== height) {
        this.offscreenCanvas.width = width;
        this.offscreenCanvas.height = height;
      }

      // 绘制像素数据
      const imageData = this.offscreenCtx.createImageData(width, height);
      const buf = new Uint8ClampedArray(pixels.buffer);
      imageData.data.set(buf);
      this.offscreenCtx.putImageData(imageData, 0, 0);

      return this.offscreenCanvas;
    },

    // 添加优化的解码方法
    decodeBitmapOptimized(jpegData) {
      if (!jpegData || jpegData.length === 0) return null;

      try {
        if (!this.offscreenCanvas) {
          this.offscreenCanvas = document.createElement('canvas');
          this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        }

        const rawImageData = jpeg.decode(jpegData, { useTArray: true });
        const { width, height, data } = rawImageData;

        // 只在必要时调整尺寸
        if (this.offscreenCanvas.width !== width || this.offscreenCanvas.height !== height) {
          this.offscreenCanvas.width = width;
          this.offscreenCanvas.height = height;
        }

        const imgData = this.offscreenCtx.createImageData(width, height);
        imgData.data.set(data);
        this.offscreenCtx.putImageData(imgData, 0, 0);

        return this.offscreenCanvas;
      } catch (e) {
        console.error('解码图像失败:', e);
        return null;
      }
    },
    // 将像素点绘制到指定大小的canvas上
    createBitmap(width, height, pixels) {
      const canvas = this.$refs.overlay;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(width, height);

      // 设置像素数据
      for (let i = 0; i < pixels.length; i++) {
        imageData.data[i] = pixels[i]; // pixels 是 Uint8ClampedArray 或类似的数组
      }

      ctx.putImageData(imageData, 0, 0);
      return canvas
    },

    // 将jpeg图像解压缩，还原成位图，并绘制到canvas上
    decodeBitmap(jpegData) {
      const rawImageData = jpeg.decode(jpegData, { useTArray: true }); // 解码为像素数据
      const { width, height, data } = rawImageData;

      const offscreenCanvas = document.createElement('canvas')
      offscreenCanvas.width = width
      offscreenCanvas.height = height
      const ctx = offscreenCanvas.getContext('2d');
      // ctx.clearRect(0, 0, width, height)
      const imgData = ctx.createImageData(width, height);
      imgData.data.set(data); // 设置解码后的像素数据 (RGBA 格式)
      ctx.putImageData(imgData, 0, 0);
      return offscreenCanvas
    },

    drawFaceRectangle(frameDetect, bitmap, width, height) {

      if (!bitmap) {
        return
      }
      if (width === 0 || height === 0) {
        return
      }

      // 当前帧是否检测到人脸
      const currentFrameHasFace = frameDetect && frameDetect.some(d => d && d.hasFace);

      // 优化调试日志：只在人脸检测状态变化时输出
      if (!this.lastFrameHasFace !== !currentFrameHasFace) {
        console.log('🔍 人脸检测状态变化:', {
          frameDetect: !!frameDetect,
          currentFrameHasFace: currentFrameHasFace,
          hasSayHello: this.hasSayHello,
          frameDetectCount: frameDetect ? frameDetect.length : 0
        })
        this.lastFrameHasFace = currentFrameHasFace;
      }

      // 进一步减少日志：只在眼球状态真正改变时输出
      if (this.lastEyeDirectlyLog !== this.eyeIsDirectly) {
        console.log(`👁️ 眼球状态变化: ${this.lastEyeDirectlyLog} -> ${this.eyeIsDirectly}`);
        this.lastEyeDirectlyLog = this.eyeIsDirectly;
      }

      // 如果当前帧没有检测到人脸，立即重置眼球状态
      if (!currentFrameHasFace) {
        if (this.eyeIsDirectly || this.canInteract) {
          console.log('❌ 当前帧未检测到人脸，重置眼球状态');
          this.eyeIsDirectly = false;
          this.canInteract = false;
          // 清空眼球状态记录，确保实时性
          this.eyeStateRecords = [];
          this.headPoseRecords = [];
        }
        return;
      }

      // 绘制人脸框
      if (frameDetect) {
        frameDetect.forEach((detect) => {
          if (detect && detect.hasFace) {
            const { faceX, faceY, faceW, faceH } = detect.faceInfo;
            BGRUtil.drawFaceLine(bitmap, width, height, faceX, faceY, faceW, faceH);
          }
          if (detect && detect.hasFace) {
            if (!this.hasSayHello) {
              console.log(`🎉 检测到人脸并准备打招呼!`)
              console.log(`👋 打招呼了`)
              this.hasSayHello = true
              this.playWakenAudio()
            } else {
              console.log(`😊 检测到人脸，但已经打过招呼了`)
            }

            // 【临时修改】简化语音唤醒条件：去除eyeIsDirectly依赖
            // 原逻辑：this.canInteract && this.eyeIsDirectly && currentFrameHasFace
            const canWakeup = this.sdkStatus === 1 &&
              this.canInteract &&
              currentFrameHasFace &&
              this.interactiveStatus === 1;

            if (canWakeup) {
              console.log('✅ 触发语音唤醒');
              this.sendMsgToMain('window-message-from-renderer', { type: 'cmd', data: 'wakeup' })
            } else if (this.sdkStatus === 1) {
              // 【临时修改】调试信息：去除eyeIsDirectly相关信息
              console.log(`❌ 未触发唤醒，缺少条件:`);
              console.log(`   - SDK状态未唤醒: ${this.sdkStatus === 1 ? '✓' : '✗ (' + this.sdkStatus + ')'}`);
              console.log(`   - 可以交互: ${this.canInteract ? '✓' : '✗'}`);
              console.log(`   - 当前帧有人脸: ${currentFrameHasFace ? '✓' : '✗'}`);
              console.log(`   - 交互状态: ${this.interactiveStatus === 1 ? '✓' : '✗ (' + this.interactiveStatus + ')'}`);
              console.log(`   - 页面状态: ${this.pageStatus} (${this.pageStatusMap[this.pageStatus] || '未知'})`);
              console.log(`   - 头姿记录数: ${this.headPoseRecords.length}`);
            }
          }
        });
      }
    },

    clearVideoBitmap() {
      const canvas = this.$refs.overlay; // 页面中的 <canvas> 元素
      if (!canvas) return
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    },

    drawCanvasToScreen(canvasWithImg, sourceWidth, sourceHeight) {
      const canvas = this.$refs.overlay;
      if (!canvas) return;

      // 🔧 修复：检查Canvas尺寸异常并自动修复
      const container = this.$refs.cameraPanel;
      if (container && (canvas.width === 0 || canvas.height === 0 ||
        canvas.width !== container.clientWidth ||
        canvas.height !== container.clientHeight)) {
        console.warn('⚠️ 检测到Canvas尺寸异常，自动修复');
        this.resizeCanvas();
        // 等待下一帧再绘制
        requestAnimationFrame(() => {
          if (canvas.width > 0 && canvas.height > 0) {
            this.drawCanvasToScreen(canvasWithImg, sourceWidth, sourceHeight);
          }
        });
        return;
      }

      // 获取Canvas上下文
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 计算绘制区域
      const sourceSize = { width: sourceWidth, height: sourceHeight };
      const { offsetX, offsetY, drawWidth, drawHeight } =
        this.resizeImageRect(sourceSize, { width: canvas.width, height: canvas.height });

      // 直接绘制
      ctx.drawImage(
        canvasWithImg,
        0, 0, sourceWidth, sourceHeight,
        offsetX, offsetY, drawWidth, drawHeight
      );
    },

    drawVideoFrame(imageBuffer) {
      if (imageBuffer.byteLength <= 0) {
        return
      }
      const canvas = this.$refs.overlay; // 页面中的 <canvas> 元素
      const ctx = canvas.getContext('2d');
      // 清除上一次绘制的内容
      // ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 将 Buffer 转为图片并绘制到 Canvas 上
      const blob = new Blob([imageBuffer], { type: 'image/png' });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        let sourceSize = { width: img.width, height: img.height }
        const { offsetX, offsetY, drawWidth, drawHeight } = this.resizeImageRect(sourceSize, { width: canvas.width, height: canvas.height })
        // 绘制缩放后的图像
        ctx.drawImage(img, 0, 0, sourceSize.width, sourceSize.height, offsetX, offsetY, drawWidth, drawHeight);
        URL.revokeObjectURL(url); // 释放内存
      };
      img.src = url;
    },

    // 将图像的尺寸换算成destSize的尺寸
    resizeImageRect(sourceSize, destSize) {
      const sourceWidth = sourceSize.width; // 960px
      const sourceHeight = sourceSize.height; // 960px

      const targetWidth = destSize.width; // 400px
      const targetHeight = destSize.height; // 100px

      // 计算缩放比例
      const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);

      // 计算绘制位置，使图像居中
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;

      const offsetX = (targetWidth - drawWidth) / 2;
      const offsetY = (targetHeight - drawHeight) / 2;

      return { offsetX, offsetY, drawWidth, drawHeight }
    },

    // --------------------------------添加手势--------------------------------------
    // registerGestures() {
    //   document.body.addEventListener('touchstart', (event) => {
    //     this.startX = event.touches[0].clientX;
    //     this.isDragging = true;
    //   })
    //   document.body.addEventListener('touchmove', (event) => {
    //     if (!this.isDragging) return
    //     const currentX = event.touches[0].clientX
    //     const diff = currentX - this.startX
    //     console.log(`滑动x: ${diff}`)
    //     if (diff > 100) {
    //       this.sendMsgToMain('toggle-fullscreen')
    //       this.isDragging = true
    //     }
    //   })
    //   document.body.addEventListener('touchend', () => {
    //     this.isDragging = false;
    //   });
    // },

    scrollToAnswerBottom() {
      this.$nextTick(() => {
        const answeringBox = this.$refs.answeringBox;
        if (answeringBox) {
          // 强制重绘以确保获取正确的scrollHeight
          answeringBox.style.display = 'none';
          answeringBox.offsetHeight; // 触发重排
          answeringBox.style.display = '';

          // 使用scrollIntoView确保滚动到底部
          const lastChild = answeringBox.lastElementChild || answeringBox;
          lastChild.scrollIntoView({ behavior: 'instant', block: 'end' });

          // 双重保险设置scrollTop
          answeringBox.scrollTop = answeringBox.scrollHeight;
        }
      });
    },

    observeAnsweringBox() {
      const answeringBox = this.$refs.answeringBox;
      if (answeringBox) {
        // 先断开可能存在的旧观察者
        if (this.answeringBoxObserver) {
          this.answeringBoxObserver.disconnect();
        }
        this.answeringBoxObserver = new MutationObserver(() => {
          // 只在文本未展示完成时才自动滚动
          if (!this.textDisplayCompleted) {
            this.scrollToAnswerBottom();
          }
        });
        this.answeringBoxObserver.observe(answeringBox, {
          childList: true,    // 监听子元素变化
          subtree: true,      // 监听所有子孙元素
          characterData: true // 监听文本内容的变化
        });
      }
    },

    // 页面状态变化时重新检查滚动观察者
    checkAnsweringBoxObserver() {
      if (this.pageStatus >= 9 && this.pageStatus < 14) {
        this.$nextTick(() => {
          this.observeAnsweringBox();
          // 只在文本未展示完成时才手动触发滚动
          if (!this.textDisplayCompleted) {
            this.scrollToAnswerBottom();
          }
        });
      } else if (this.answeringBoxObserver) {
        this.answeringBoxObserver.disconnect();
      }
    },

    sendMsgToMain(channel, args = null) {
      console.log(`sendMsgToMain channel: ${channel}`)
      ipcRenderer.send(channel, args)
    },

    // ----------------------------------点我提问-----------------------------------
    askQuestionClick() {
      if (!this.isConnected) {
        return
      }
      console.log(`要提问了`)
      this.interactiveStatus = 1
      // 清空问题
      this.handlePageStatus()
      this.sdkStatus = 1
      this.pageStatus = -1

      // 🔧 修复：点击提问时，清理之前可能存在的"未找到参考资料"音频监听器
      this.clearNoReferenceAudioEndCallback()
      this.isNoReferenceAudioPlaying = false
      console.log('🧹 点击提问，已清理旧的"未找到参考资料"状态和监听器')

      // this.showQuestionBox = false
      this.curQuestion = {
        "question": "",
        "answer": "",
        "url": null,
        refList: [],
        originRefList: [],
        selectedIndex: -1
      }
      this.curSrResult = ""
      this.preMsgs = []
      this.lastStreamTime = null // 重置流式数据时间戳

      // 重置眼球跟踪状态，确保需要重新正视
      this.resetEyeTrackingState();
      console.log('点击提问按钮，重置眼球状态，要求重新正视');
    },

    // -----------------------------------查看原文-------------------------------------
    originBtnClick() {
      this.showOriginText = !this.showOriginText
      this.originBtnText = this.showOriginText ? '返回' : '查看原文'
    },

    iFrameLoaded() {
      let iframe = this.$refs.iframe
      if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
        const iframeBody = iframe.contentDocument.body;
        const iframeWidth = iframeBody.scrollWidth; // 获取 iframe 内容的实际宽度
        iframe.style.width = iframeWidth + 'px';
        iframe.style.overflow = 'hidden'; // 隐藏 iframe 的所有滚动条
      }
    },

    // -----------------------------------用户引导-------------------------------------
    showUserGuideBtnClick() {
      console.log(1);
      this.initDriver()
      // this.showUserGuide = true
    },

    showUserGuidePic() {
      this.userGuideIndex = 0
    },
    startLongPress() {
      console.log("开始长按事件");

      this.isLongPressing = true;
      this.pressStartTime = Date.now();
      this.longPressTimer = setTimeout(() => {
        if (this.isLongPressing) {
          this.handleLongPress();
        }
      }, 500);
    },
    cancelLongPress() {
      console.log("取消长按事件");

      const duration = Date.now() - this.pressStartTime;
      this.isLongPressing = false;
      clearTimeout(this.longPressTimer);
      if (duration < 500 && duration > 0) {
        this.showUserGuideBtnClick();
      }
    },
    handleLongPress() {
      // 长按后切换全屏状态
      this.isFullscreen = !this.isFullscreen;
      ipcRenderer.send('window-set-fullscreen', this.isFullscreen);
      console.log('长按事件触发，全屏状态:', this.isFullscreen);
    },

    userGuideClick() {
      this.userGuideIndex += 1
      if (this.userGuideIndex > this.userGuideSteps.length - 1) {
        this.userGuideIndex = 0
        this.showUserGuide = false
      }
    },
    sendToIrisWorker(data) {
      ipcRenderer.send('send-to-iris-worker', data);
    },
    // 重置眼球跟踪状态
    resetEyeTrackingState() {
      // 重置眼球正视状态
      this.eyeIsDirectly = false;
      this.canInteract = false;

      // 清空眼球状态记录
      this.eyeStateRecords = [];
      this.headPoseRecords = [];

      // 重置时间戳
      this.eyeLastUpdateTime = Date.now();
      this.lastInteractCheck = 0;

      console.log('眼球跟踪状态已重置，需要重新进行正视判定');
    },

    // 🔧 新增：设置窗口大小变化监听器
    setupWindowResizeHandler() {
      // 防抖处理，避免频繁调用
      let resizeTimer = null;

      const handleResize = () => {
        if (resizeTimer) {
          clearTimeout(resizeTimer);
        }

        resizeTimer = setTimeout(() => {
          console.log('🔄 窗口大小变化，重新调整Canvas尺寸');

          // 只有在显示摄像头时才调整
          if (this.showCamera && this.$refs.cameraPanel) {
            this.resizeCanvas();
          }
        }, 100); // 100ms防抖
      };

      // 监听窗口大小变化
      window.addEventListener('resize', handleResize);

      // 监听全屏状态变化
      document.addEventListener('fullscreenchange', () => {
        console.log('🔄 全屏状态变化，重新调整Canvas尺寸');
        setTimeout(() => {
          if (this.showCamera && this.$refs.cameraPanel) {
            this.resizeCanvas();
          }
        }, 200); // 延迟调整，等待DOM更新
      });

      // 存储清理函数
      this._resizeCleanup = () => {
        window.removeEventListener('resize', handleResize);
        if (resizeTimer) {
          clearTimeout(resizeTimer);
        }
      };
    },

    // 新增：眼球正视时的自动交互触发处理
    onEyeDirectlyDetected() {
      // 🔧 修复：添加调试信息，避免不必要的状态重置
      console.log('🎯 眼球正视检测触发，当前状态:', {
        interactiveStatus: this.interactiveStatus,
        pageStatus: this.pageStatus,
        hasQuestion: !!this.curQuestion,
        hasRefList: !!(this.curQuestion && this.curQuestion.refList)
      });

      // 如果当前不在交互状态，自动切换到交互状态
      if (this.interactiveStatus !== 1) {
        console.log('🎯 检测到眼球正视，自动切换到交互状态');
        this.interactiveStatus = 1;
        return;
      }

      // 🔧 修复：在文件选择阶段(pageStatus=7)或正在处理中，不要重置状态
      if (this.pageStatus >= 3 && this.pageStatus <= 13) {
        console.log('🔒 当前正在处理问题，不重置状态, pageStatus:', this.pageStatus);
        return;
      }

      // 如果已经在交互状态，但页面状态显示已完成回答或无状态，准备开始新的交互
      if (this.pageStatus === -1 || this.pageStatus === 14) {
        console.log('🎯 检测到眼球正视，准备开始新的语音交互');
        // 不需要重置太多状态，保持用户体验的连续性
        this.handlePageStatus();
        this.pageStatus = -1;
        this.curQuestion = {
          "question": "",
          "answer": "",
          "url": null,
          refList: [],
          originRefList: [],
          selectedIndex: -1
        };
        this.curSrResult = "";

        // 轻量级的眼球状态重置，保持当前正视状态
        this.canInteract = true; // 直接设置为可交互
        this.eyeLastUpdateTime = Date.now();

        console.log('✅ 已准备好接受语音输入');
      }
    },

    // 🔧 新增：iris worker健康检查
    startIrisHealthCheck() {
      console.log('🔍 启动iris worker健康检查');
      this.irisHealthCheckTimer = setInterval(() => {
        this.checkIrisWorkerHealth();
      }, 15000); // 每15秒检查一次
    },
    
    // 🔧 新增：动态调整健康检查频率
    adjustHealthCheckFrequency(isHealthy) {
      if (this.irisHealthCheckTimer) {
        clearInterval(this.irisHealthCheckTimer);
      }
      
      // 根据健康状态调整检查频率
      const interval = isHealthy ? 30000 : 10000; // 健康时30秒，不健康时10秒
      
      console.log(`🔄 调整健康检查频率为${interval/1000}秒`);
      this.irisHealthCheckTimer = setInterval(() => {
        this.checkIrisWorkerHealth();
      }, interval);
    },

    checkIrisWorkerHealth() {
      const now = Date.now();
      const timeSinceLastData = now - this.lastIrisDataReceiveTime;

      // 避免初始化时的异常值
      if (this.lastIrisDataReceiveTime === 0 || timeSinceLastData < 0) {
        this.lastIrisDataReceiveTime = now;
        return;
      }

      // 如果超过30秒没有收到iris数据，认为worker可能有问题
      if (timeSinceLastData > 30000 && this.showCamera && this.interactiveStatus === 1) {
        console.warn('⚠️ iris worker可能无响应，距离上次数据:', Math.round(timeSinceLastData / 1000) + '秒');

        // 先尝试健康检查
        this.sendMsgToMain('window-message-from-renderer', {
          type: 'healthCheck',
          timestamp: now
        });

        // 如果超过60秒，尝试重置
        if (timeSinceLastData > 60000) {
          console.log('🚨 iris worker长时间无响应，尝试重置');
          this.sendMsgToMain('window-message-from-renderer', {
            type: 'resetWorker',
            timestamp: now
          });

          // 重置后更新时间戳，避免重复重置
          this.lastIrisDataReceiveTime = now;
        }
      }
    },
  }
}
</script>


<style scoped>
.status-update-enter-active,
.status-update-leave-active {
  transition: all 0.4s ease-in-out;
}

.status-update-enter-from {
  transform: translateY(300%);
  /* 最大化新状态从下方进入的效果 */
  opacity: 0;
}

.status-update-leave-to {
  transform: translateY(-300%);
  /* 最大化旧状态向上退出的效果 */
  opacity: 0;
}

.status-text {
  position: relative;
  display: inline-block;
  line-height: 40px;
  /* 匹配容器高度确保文本垂直居中 */
}

.notice-box {
  position: relative;
  overflow: hidden;
  height: 40px;
  /* 固定高度确保动画完整可见 */
}

/* 隐藏水平和垂直滚动条 */
::-webkit-scrollbar {
  display: none;
  /* 对于 Webkit 内核浏览器，如 Chrome 和 Safari */
}

html {
  -ms-overflow-style: none;
  /* 对于 Internet Explorer 和 Edge */
  scrollbar-width: none;
  /* 对于 Firefox */
}

.content-pannel {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.video-pannel {
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
}

.video-control-box {
  width: 100%;
  height: 100%;
  z-index: 1000;
  position: absolute;
  top: 0;
  left: 0;
}

.video-fill {
  object-fit: cover;
}

.content-box {
  width: calc(100% - 44px);
  height: 50%;
  position: absolute;
  bottom: 0;
  left: 0;
  /*border: #e1f3d8 1px solid;*/
  z-index: 1050;
  /*background-color: rgba(1, 1, 1, 0.2);*/
  border: 2px solid white;
  margin: 0 20px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
}

.question-box {
  width: 100%;
  padding: 10px 0;
  line-height: 40px;
  min-height: 40px;
  font-size: 36px;
  color: white;
  background-color: rgba(70, 130, 180, 0.7);
}

.seperate-line {
  width: 100%;
  height: 2px;
  background-color: #ececec;
}

.notice-box {
  width: calc(100% - 20px);
  background-color: rgba(135, 206, 250, 0.8);
  text-align: left;
  padding-left: 20px;
  color: #fff;
  font-size: 18px;
  overflow: hidden;
}

.answer-box {
  width: calc(100% - 20px);
  font-size: 30px;
  color: white;
  flex: 1;
  padding: 10px 10px;
  background-color: rgba(135, 206, 250, 0.8);
  text-align: left;
  white-space: pre-line;
  overflow-y: scroll;
}

.reging-box {
  z-index: 3000;
  width: calc(1920 / 500 * 167px);
  position: fixed;
  top: 0;
  right: calc(1080/1920 * 400px);
  display: flex;
  flex-direction: column;
  font-size: 20px;
  color: #409eff;
  text-align: right;
}

.reging-gif {
  width: calc(1920 / 500 * 167px);
  height: calc(500 / 1920 * 640px);
}

.reging-gif img {
  width: calc(1920 / 500 * 167px);
  height: calc(500 / 1920 * 640px);
  border-radius: 68px;
}

.left-hint img {
  width: 50px;
  height: 50px;
  position: absolute;
  left: -30px;
  top: -30px;
}

.ref-doc-list {
  width: 100%;
}

.ref-doc-hint {
  font-size: 24px;
}

::v-deep .el-table__body tr.current-row>td {
  background: #0ac8f3 !important;
  color: #ffffff;
}

.camera-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: calc(1080/1920 * 400px);
  height: calc(1080/1920 * 400px);
  z-index: 3500;
  overflow: hidden;
  /* 🔧 修复：添加尺寸稳定性保护 */
  min-width: 200px;
  min-height: 200px;
  box-sizing: border-box;
}

.camera-overlay {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  right: 0;
  z-index: 4000;
}

.ask-question-box {
  width: 200px;
  border-radius: 20px;
  z-index: 4000;
  position: absolute;
  right: 0;
  bottom: calc(50% + 5px);
}

.ask-question-img {
  width: 188px;
  height: 333px;
  opacity: 0.8;
  object-fit: cover;
  overflow: hidden;
}

.ask-question-hint {
  font-size: 20px;
  font-weight: bold;
  height: 50px;
  position: absolute;
  right: 20px;
  bottom: 0;
}

.origin-text-box {
  width: calc(100% - 40px);
  height: calc(50% - 5px);
  margin: 0 20px;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1050;
}

.origin-iframe-box {
  width: 100%;
  height: calc(100% - 55px);
  overflow-x: hidden;
  overflow-y: scroll;
  background-color: antiquewhite;
}

.origin-btn-box {
  height: 50px;
  bottom: 0;
  left: 0;
  position: absolute;
  font-size: 20px;
  font-weight: bold;
  border: none;
}

.origin-bg-box {
  width: 100%;
  height: 100%;
  background-color: #DBDEDF;
  z-index: 1030;
  position: absolute;
  left: 0;
  top: 0;
}

.show-user-guide-box {
  width: 100px;
  height: 100px;
  position: absolute;
  left: 20px;
  top: 20px;
  z-index: 4600;
  overflow: hidden;
}

.show-user-guide-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-guide {
  width: 100%;
  height: 100%;
  position: absolute;
  left: 0;
  top: 0;
  z-index: 2000;
}

.user-guide img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.eye-interaction-hint {
  position: absolute;
  top: 20px;
  right: 20px;
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.9), rgba(64, 200, 255, 0.9));
  border-radius: 20px;
  padding: 8px 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 5000;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  animation: eyeHintPulse 2s ease-in-out infinite;
}

.hint-content {
  display: flex;
  align-items: center;
  color: white;
  font-size: 14px;
  font-weight: 500;
}

.hint-content i {
  margin-right: 8px;
  font-size: 16px;
}

@keyframes eyeHintPulse {

  0%,
  100% {
    transform: scale(1);
    opacity: 0.9;
  }

  50% {
    transform: scale(1.05);
    opacity: 1;
  }
}
</style>