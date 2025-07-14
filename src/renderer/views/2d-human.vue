<template>
  <div class="content-pannel">
    <div class="video-pannel">
      <video id="video" class="video-control-box video-fill" loop="loop" preload="auto" :poster="require('../assets/hostee.png')">
<!--        <source :src="require('../assets/test.mp4')">-->
        <source :src="videoUrl">
      </video>
      <audio id="audio" :src="resultAudioUrl"></audio>

      <div class="origin-bg-box" v-if="showOriginText"></div>

      <!-- 查看政策原文框 -->
      <div class="origin-text-box">
        <iframe class="origin-iframe-box" id="iframe" v-if="showOriginText && originUrl && originUrl.length > 0"  :src="originUrl" ref="iframe" @load="iFrameLoaded"></iframe>
        <el-button round type="primary" class="origin-btn-box" @click="originBtnClick" v-if="showOriginBtn">{{ originBtnText }}</el-button>
      </div>

      <div class="reging-box">
        <div>{{ curSrResult }}</div>
      </div>

      <div class="show-user-guide-box" @click="showUserGuideBtnClick" v-if="!showOriginText">
        <img :src="require('../assets/guide.png')">
      </div>

      <!-- 摄像头数据 -->
      <div class="camera-panel" ref="cameraPanel" id="cameraPanel" v-if="showCamera">
        <!--        <video class="camera-content" ref="camera" autoplay playsinline></video>-->
        <canvas class="camera-overlay" ref="overlay" />
      </div>

      <!-- 答案框 v-if="showQuestionBox" -->
      <div class="content-box" ref="container" >
        <!--问题 -->
        <div class="question-box">
          <div v-if="errorInfo">{{ errorInfo }}</div>
          <div v-else-if="curQuestion && curQuestion.question.length > 0">{{ curQuestion.question }}</div>
          <div v-else></div>
        </div>
        <div class="seperate-line"></div>
        <!--答案 -->
        <div class="answer-box">
          <div v-if="pageStatus === 14 && curQuestion.answer && curQuestion.answer.length > 0">{{ curQuestion.answer }}</div>
          <div v-else-if="pageStatus >= 9 && pageStatus < 14" ref="answeringBox">
            <!-- 内容  -->
            <div v-if="showAnswer && showAnswer.length > 0">{{ showAnswer }}</div>
            <div v-else></div>
          </div>
          <div class="ref-doc-list" v-else-if="pageStatus >= 7 && pageStatus < 9">
            <div v-if="curQuestion">
              <div v-if="curQuestion.question && curQuestion.selectedIndex===-1">
                <div class="ref-doc-hint">请触屏选择或语音说出您想要了解的政策文件序号：</div>
                <div style="margin-top: 10px">
                  <el-table width="100%" :data="curQuestion.refList" border stripe @current-change="refListSelected">
                    <el-table-column type="index" label="序号" width="50" align="center"></el-table-column>
                    <el-table-column prop="fileName" label="文件名称"></el-table-column>
                  </el-table>
                </div>
              </div>
              <div v-else>
                <div class="ref-doc-hint in">您选择了解的政策文件名称是：{{ curQuestion.refList[curQuestion.selectedIndex].fileName }}</div>
              </div>
            </div>
            <div v-else></div>
          </div>
          <div v-else></div>
        </div>
      </div>

      <!-- 点我提问 -->
      <div class="ask-question-box" id="askQuestionBox" @click="askQuestionClick" v-if="showAskQuestion" >
        <img :src="require('../assets/hostee-small.png')" class="ask-question-img" v-show="showOriginText"/>
        <el-button  ref="askQuestion" id="askQuestion" round type="primary" class="ask-question-hint">点我提问</el-button>
      </div>

      <!-- 引导图 -->
      <div class="user-guide" v-if="showUserGuide" @click="userGuideClick">
        <img :src="userGuideSteps[userGuideIndex]"/>
      </div>

    </div>
  </div>
</template>

<script>
import {get_ref_doc_list, intent_recognize} from "../api/common";
const { ipcRenderer } = require('electron')
import AnceStreamAudioPlayer from '../utils/ance-stream-audio-player'
import ANCETtsSocketService from "../utils/ance-tts-socket"
import VideoSocketClient from "../iflySocket/VideoSocketClient"
import BGRUtil from "../iflySocket/BGRUtil";
import jpeg from "jpeg-js";
console.log(process.env);

export default {
  name: 'VHuman',
  data() {
    return {
      baseUrl: process.env.VUE_APP_BASE_API,
      noAnswer: '我在文件库中无法找到您问题的相关参考文件，暂时无法回答您的问题。',
      result: '',
      resultAudioUrl: "",
      needStartVad: false,
      needReWaken: false,

      // 视频播放器
      isPlaying: false,
      videoPlayerPromise: null,
      videoUrl: null,

      // 网络连接
      isConnected: true,
      errorInfo: null,

      // 当前问题
      curQuestion:  {"question": "", "answer": "", "url": null, refList: [], originRefList: [], selectedIndex:-1},
      showQuestionBox: false,

      // 流式播放
      toTTSAnswer: '',
      streamAudioPlayer: null,

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
      retryTimes: 0,

      // 取消请求使用
      cancel: null,

      // sdk状态（未使用）  1 未唤醒  2 唤醒成功  3 语音识别中  4 语音识别成功  5 语音识别失败
      sdkStatus: 1,
      // 页面状态  6 获取参考资料中  7 获取参考资料成功  8 获取参考资料失败  9 获取答案中  10 获取答案成功
      // 11 获取答案失败   12 合成语音答案中  13 语音播报中  14 完成回答
      pageStatus: -1,
      // interactiveStatus:  1 交互状态   2 非交互状态
      interactiveStatus: 2,
      // 中文数词和阿拉伯数字转换
      chnNumberChar: {
        零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10
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
      showCamera: false,

      // 查看原文相关变量
      originUrl: '',
      showOriginText: false,
      showOriginBtn: false,
      originBtnText: '查看原文',

      // 点我提问按钮
      showAskQuestion: true,

      // 是否已经打过招呼
      hasSayHello: true,
      // fadeRefList : [{"id": "63a477e2-c3fb-4002-a1ad-18a1e29a6ec2", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9810100635230796}, {"id": "2f3bd101-b23c-4f9c-9965-c0fc15d98936", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9810100635230796}, {"id": "6a5032a5-aa27-4587-aba6-8981dadabac8", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9810100590815034}, {"id": "4335f864-bd5f-493d-9585-2618ac94e312", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9783174498198205}, {"id": "d8293fd8-216e-47e0-aa5b-e23eacbbedf2", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9783174498198205}, {"id": "ab5ac820-a9a8-47b3-8f9f-e62b4a5999cd", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9783174498198205}, {"id": "502521f5-5a52-4a17-919e-9db46023b81f", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9783174498198205}, {"id": "fab7ec19-eafd-4643-8a8a-0a721d1fb4c4", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9783174498198205}, {"id": "497513c8-214c-44b9-ba5b-0d71e2ecac7d", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9783174498198205}, {"id": "9cd67be4-7992-414a-8e14-887fda7c90aa", "fileName": "关于印发《金溪县2021年开放型经济工作实施意见》的通知", "url": "https://www.jinxi.gov.cn/art/2021/12/15/art_10880_3770123.html", "reScores": 0.9783174498198205}]

      showUserGuide: false,
      userGuideSteps: [require('../assets/step0.png'), require('../assets/step1.png'), require('../assets/step2.png'), require('../assets/step3.png'), require('../assets/step4.png'), require('../assets/step5.png'), require('../assets/step6.png')],
      userGuideIndex: 0,

      // 意图识别相关
      preMsgs: []
    }
  },
  created() {
    this.$ANCESocket.connect(this)
    this.ttsWebsocket = new ANCETtsSocketService(this.ttsAudioStart, this.ttsPlayStop)
    this.login()
    this.setUpNetworkTimer()
    this.videoUrl = process.env.VUE_APP_MINIO_URL + "test.mp4"
    this.setupWorkerNotify()
  },
  beforeDestroy() {
    this.stopEndMsgTimer()
  },
  watch:{
    isConnected(newVal, oldVal) {
      if (newVal !== oldVal) {
        this.$message.info(newVal ? '网络已连接' : '网络已断开')
        this.errorInfo = newVal ? '' : '网络连接出错，请稍候再试。'
        this.interactiveStatus = 2
      }
    },
    interactiveStatus(newVal, oldVal) {
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
      } else {
        // 非交互模式
        this.showAskQuestion = true
        this.showCamera = false
        this.clearVideoBitmap()
      }
      // 从非交互模型到交互模型，需要重新打招呼
      if (oldVal === 2 && newVal === 1) {
        console.log('从非交互模型到交互模型，需要重新打招呼')
        this.hasSayHello = false
      }
    },
    showCamera(newVal, oldVal) {
      if (newVal === false) {
        this.curSrResult = ''
      }
    },
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
  },
  mounted() {
    console.log('主页面');
    
    this.registerGestures()
    this.initRecorder()
    this.observeAnsweringBox()
    this.showUserGuidePic()
  },
  methods: {
    login() {
      this.$store.dispatch('login')
    },

    // 开启监听worker通知
    setupWorkerNotify() {
      ipcRenderer.on('message-from-worker', (event, args) => {
        if (this.interactiveStatus === 2) {
          // 非交互模式
          return
        }
        // console.log('renderer收到worker线程通知', args)
        if (args.type === 'error') {
          this.errorInfo = args.data
        } else {
          if (args.type === 'asr') {
            // 语音识别结果
            this.srSuccess(args.data, args.isLast)
          } else if (args.type === 'videoFrame') {
            // 视频数据
            this.drawVideoFrame(args.data)
          } else if (args.type === 'awake') {
            this.sdkStatusCallback(3, null, false)
          } else if (args.type === 'vad_start') {
            if (this.sdkStatus === 1) {
              this.sdkStatusCallback(3, null, false)
            }
          } else if (args.type === 'sleep') {
            this.sdkStatusCallback(1, null, true)
          } else if (args.type === 'nlp') {
            this.sdkStatusCallback(4, args.data, args.isLast)
          } else if (args.type === 'vad_finish') {
            this.sdkStatusCallback(4, args.data, true)
          } else if(args.type === 'cbm_tidy') {
            this.sdkStatusCallback(4, args.data, args.isLast)
          } else if(args.type === 'vad_pause') {
            // 语音暂停，询问用户是否继续
            this.$confirm('检测到语音暂停，是否继续提问？', '提示', {
              confirmButtonText: '继续',
              cancelButtonText: '结束',
              type: 'question'
            }).then(() => {
              // 用户选择继续，发送继续指令到worker
              ipcRenderer.send('message-from-renderer', {type: 'continue_vad'});
            }).catch(() => {
              // 用户选择结束，提交当前识别结果
              this.sdkStatusCallback(4, args.data, true);
            });
          } else if (args.type === 'ip') {
            if (!this.isCameraInit) {
              this.cameraIp = args.data
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
          that.sdkStatusCallback(3, null, false)
          that.needStartVad = false
        }
        that.videoPlayer.pause()
      })
      this.videoPlayer.addEventListener('play', function () {
        that.isPlaying = true
        console.info('-----video play----', that.isPlaying)
      })
      this.videoPlayer.addEventListener('pause', function() {
        that.isPlaying = false
        that.videoPlayer.load()
        console.info('-----video pause----', that.isPlaying)
      })
      this.videoPlayer.addEventListener('error', function(event) {
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
      console.log(`----old ${this.sdkStatus} -> new ${sdkState}`)
      this.sdkStatus = sdkState
      switch (sdkState) {
        case 1:
          if (this.pageStatus === 6) {
            // sdk need to wakeup
            console.info("need to wakeup sdk")
          }else if (this.pageStatus === 7) {
            this.retryTimes += 1
            if (this.retryTimes >= 3) {
              this.asrSelectIndex(1)
              this.retryTimes = 0
            }
          } else {
            if (this.curSrResult.length > 0) {
              this.srSuccess(this.curSrResult, true)
            }
            this.interactiveStatus = 2
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
      if ("" === singleResult || null == singleResult) {
        return
      }
      console.log(`语音识别结果: ${singleResult}, 是否结束：${isEnded}`)
      this.stopEndMsgTimer()

      if (!isEnded) {
        // 未完成识别
        this.curSrResult = singleResult
        // if (this.pageStatus === 7) {
          this.endMsgTimer = setTimeout(() => {
            this.sdkStatusCallback(4, this.curSrResult, true)
          }, 2500)
        // }
        return
      }

      const currentTimestamp = Date.now()
      const interval = currentTimestamp - this.lastReceiveTimestamp
      console.log(`收到消息的时间间隔：`, interval)
      if (this.lastIatMsg && singleResult === this.lastIatMsg && interval < this.MSG_INTERVAL) {
        console.log(`短时间内收到两个相同的消息，丢弃`)
        this.lastIatMsg = singleResult
        this.lastReceiveTimestamp = currentTimestamp
        return
      }
      this.lastIatMsg = singleResult
      this.lastReceiveTimestamp = currentTimestamp
      this.curSrResult = singleResult
      let result = singleResult
      // 判断页面状态，若是获取参考资料成功，则识别出的语音匹配参考资料列表序号
      if (this.pageStatus === 7) {
        let selectedRefIndex = -1
        // 1 找出语音识别结果中的阿拉伯数字
        let index = result.replace(/[^\d]/g, "")
        if (index !== '') {
          selectedRefIndex = index
          this.asrSelectIndex(selectedRefIndex)
          return
        }
        // 2 找出语音识别结果中汉字中的数词
        for (let key in this.chnNumberChar) {
          let index = result.indexOf(key)
          if (index !== -1) {
            selectedRefIndex = this.chnNumberChar[key]
            break;
          }
        }
        console.log(`通过语音解析出来的选择的序号是：${selectedRefIndex}`)
        if (selectedRefIndex === -1) {
          this.retryTimes += 1
          if (this.retryTimes >= 3) {
            this.asrSelectIndex(1)
            this.retryTimes = 0
          } else {
            this.playChooseRefAudio()
          }
          return
        }
        this.asrSelectIndex(selectedRefIndex)
        return
      }

      console.log(`当前问题：`, JSON.parse(JSON.stringify(this.curQuestion)))
      // let index = this.qaList.findIndex(item => item.question === result)
      const isExist = this.curQuestion && this.curQuestion.question === result
      console.info('--是否存在相同问题--', isExist ? '是' : '否')
      if (isExist) {
        // 相同的问题，丢弃
        return
      }

      this.handlePageStatus()
      this.pageStatus = 6
      let qa = {"question": result, "answer": "", "url": null, refList: [], originRefList: [], selectedIndex:-1}
      console.info(`新增问题: ${result}`)
      this.curQuestion = qa
      this.showQuestionBox = true
      this.showAskQuestion = true

      // 2025.7.9 修改
      // 1 意图识别   2 获取参考资料  3 选择参考资料   4 获取答案
      this.stepIntentRecognize(result)
    },

    // 意图识别
    stepIntentRecognize(question) {
      // 请求参考文件列表
      let param = {'question': question}
      let that = this

      intent_recognize(param, this).then(res => {
        let resObj = JSON.parse(res.data)
        console.info(`intent_recognize: ${resObj}`)
        if (resObj.is_clear) {
          // 问题是完整的
          let query = resObj.query
          // 获取参考资料
          that.stepGetRefDocList(query)
        } else {
          // 问题不完整， 记录之前的问题，语音询问是否
          const feedback = resObj.feedback
          this.ttsWebsocket.send(this, 'Audio', feedback)
          this.preMsgs.append(question)
        }
      })
    },

    // 2 获取参考资料
    stepGetRefDocList(question) {
      let that = this
      get_ref_doc_list({'question': question}, this).then((res) => {
        that.pageStatus = 7
        that.toTTSAnswer = ""
        let data = JSON.parse(res.data)
        // console.info('去重前：', data)
        if (data && data instanceof Array && data.length > 0) {
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
          console.info('参考文献结果：', itemList)
        } else {
          that.pageStatus = 12
          that.curQuestion.refList = null
          that.curQuestion.originRefList = null
          that.curQuestion.answer = that.noAnswer
          that.toTTSAnswer = that.noAnswer
          that.startStreamTTSTimer()
          that.fakeStreamText(false)
          this.interactiveStatus = 2
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
      console.info('语音选择的文件序号是：', selectedRefIndex)
      if (selectedRefIndex >= 0 && selectedRefIndex < this.curQuestion.refList.length) {
        let selectedRow = this.curQuestion.refList[selectedRefIndex]
        this.refListSelected(selectedRow)
      } else {
        console.info('选择的文件序号超过参考文件列表长度')
        this.playOutboundListAudio()
      }
    },

    // 处理参考文件列表被选择
    refListSelected(currentRow) {
      this.playWaitingAudio()
      this.originUrl = currentRow.url
      console.log('originUrl', this.originUrl)
      this.showOriginBtn = true
      this.curQuestion.selectedIndex = this.curQuestion.refList.indexOf(item => {
        return item.id === currentRow.id
      })

      // 传递的参数是文件名
      let title = currentRow.fileName
      if (title && title.length > 0) {
        this.pageStatus = 9
        this.interactiveStatus = 2
        this.sendWSMessage(this.curQuestion.question, title)
      } else {
        console.info('未找到对应的参考文件')
      }
    },

    changeSRStatus(val) {
      this.isRecognizing = val
    },

    //------------ websocket 消息--------------
    sendWSMessage(content, refIds=null) {
      if (null == content || "" === content) {
        return
      }
      // 发送websocket消息
      let msg = { content: content,
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
        // console.info('--websocket data---', data)
        if (this.pageStatus < 10) {
          this.pageStatus = 10
        }
        // 答案的音频
        let qaItem = this.curQuestion
        if (data.fileType === 1) {
          if (!data.stream) {  // 非流式
            this.toTTSAnswer = data.content
          } else {   // 流式
            this.toTTSAnswer += data.content
          }
          // 将答案写回列表中
          qaItem.answer = this.toTTSAnswer
          // 需要流式生成音频数据
          if (this.toTTSAnswer.length > 0) {
            this.startStreamTTSTimer()
          }
          // 生成假的流式效果
          this.fakeStreamText(false)
        } else if (data.fileType === 3) {
          qaItem.answer = data.content
          qaItem.url = data.fileUrl
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
        console.info(e)
      }
    },

    closeAnswerWebsocket() {
      console.info('主动关闭获取答案的websocket')
      this.$ANCESocket.close()
    },

    updateAudioSrc(url, isLocal, needStartVad=false, needReWakenSDK=false) {
      if (isLocal) {
        this.resultAudioUrl = require(`../assets/${url}`)
      } else {
        this.resultAudioUrl = process.env.VUE_APP_MINIO_URL + url
      }

      let that = this
      setTimeout(() => {
        that.needStartVad = needStartVad
        that.needReWaken = needReWakenSDK

        that.audioPlayer.load()
        that.audioPlayer.play()

        that.startPlayVideo()
      }, 500)
    },

    ttsAudioStart() {
      if (this.pageStatus === 14) {
        this.disturbAnswering()
      } else {
        this.pageStatus = 13
        this.startPlayVideo()
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
      this.pageStatus = 14
      this.videoPlayer.pause()
      this.stopStreamTTSTimer()
      this.fakeStreamText(true)
    },

    // ---------------网络检测-------------------
    setUpNetworkTimer() {
      ipcRenderer.on('network-status', (event, args) => {
        // console.info('Received network status:', args)
        this.isConnected = args
        this.$store.dispatch('changeNetworkStatus', args).then(() =>{})
      });
    },

    // --------------- 语音唤醒-------------------
    wakenSuccessHandler() {
      this.playWakenAudio()
    },

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
      this.streamTTSTimer = setInterval(() => {
        this.pageStatus = 12
        if (this.sendedLength < this.toTTSAnswer.length) {
          const lastIndex = this.foundLastSeperatorIndex(this.toTTSAnswer)
          let sendText = ""
          // 截取从开始到最后一个分隔符的位置的子串
          if (lastIndex !== -1 && lastIndex > this.sendedLength) {
            sendText = this.toTTSAnswer.substring(this.sendedLength, lastIndex);
            this.ttsWebsocket.send(this, 'Audio', sendText)
            this.sendedLength = lastIndex
          }
        } else if ((this.sendedLength >= this.toTTSAnswer.length) && this.canStopTTSTimer) {
          this.stopStreamTTSTimer()
        }
      }, 2500)
    },

    stopStreamTTSTimer() {
      if (this.streamTTSTimer) {
        clearInterval(this.streamTTSTimer)
        // 清理变量
        this.streamTTSTimer = null
        this.toTTSAnswer = ""
        this.canStopTTSTimer = false
        this.sendedLength = 0
        console.log('----stopStreamTTSTimer----')
      }
    },

    closeTTSWebsocket() {
      console.info('主动关闭合成答案语音的websocket')
      this.ttsWebsocket.close()
    },

    resetStreamText() {
      this.showedIndex = 0
      this.showAnswer = ""
      if (this.streamTimer) {
        clearInterval(this.streamTimer)
        this.streamTimer = null
      }
    },

    // 前端实现的流式文字效果
    fakeStreamText(reset=false) {
      if (reset) {
        this.resetStreamText()
      }
      if (this.showedIndex < this.toTTSAnswer.length && null == this.streamTimer) {
        this.resetStreamText()
        this.streamTimer = setInterval(() => {
          let random = Math.random()*(8-3)+3    // 产生 【3-8】之间的随机数
          let endIndex = Math.min(this.showedIndex+random, this.toTTSAnswer.length)
          const subString = this.toTTSAnswer.slice(this.showedIndex, endIndex)
          this.showAnswer += subString
          this.showedIndex = endIndex
          this.scrollToAnswerBottom()
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
        this.sendedLength = 0
      }
    },

    //---------------------- 摄像头 ------------------------------
    resizeCanvas() {
      this.$nextTick(() => {
        const container = this.$refs.cameraPanel;
        // console.log(`container`, container)
        if (container) {
          const canvas = this.$refs.overlay;
          // 设置Canvas的固有属性
          canvas.width = container.clientWidth;
          canvas.height = container.clientHeight;
          // console.log(`container width: ${container.clientWidth}, height: ${container.clientHeight}`)
        }
      })
    },

    setupVideoClient() {
      if (!this.isCameraInit) {
        this.videoSocketClient = new VideoSocketClient(this.cameraIp, this.cameraPort)
        let that = this
        this.videoSocketClient.on('connectSuccess', ()=> {
          console.log('视频连接成功')
        })
        this.videoSocketClient.on('disconnect', () => {
          console.log('视频连接断开')
          that.clearVideoBitmap()
          that.errorInfo = "摄像头连接出错，请稍候再试。"
          that.interactiveStatus = 2
          that.isCameraInit = false
        })
        this.videoSocketClient.on('onFrameData', (videoData, frameFormat, frameW, frameH, frameDetect) => {
          if (this.showCamera) {
            this.parseFrameData(videoData, frameFormat, frameW, frameH, frameDetect)
          }
        })
        this.videoSocketClient.connect()
      }
    },

    parseFrameData(data, format, width, height, frameDetect) {
      console.log(`收到视频帧信息了, format: ${format}`)
      let bitmap = null
      if (format === 0) {
        this.dataToBGRPixels(data, width, height)
        // 创建图像对象并设置像素
        bitmap = this.createBitmap(width, height, this.pixels);
      } else if (format === 1) {
        // 解码图片数据为 Bitmap 格式 (假设使用 JPEG 或 PNG 数据)
        bitmap = this.decodeBitmap(data); // 假设 decodeBitmap 是解码二进制图像数据的自定义函数
      } else {
        console.log("Unknown format:", format);
      }
      if (bitmap) {
        this.drawFaceRectangle(frameDetect, bitmap, width, height)
        this.drawCanvasToScreen(bitmap, width, height)
      }
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
          const blue = convert[offset + j * 3]  & 0xff;
          const green = convert[offset + j * 3 + 1]  & 0xff;
          const red = convert[offset + j * 3 + 2] & 0xff;
          this.pixels[colorOffset + j] = (0xff << 24) | (red << 16) | (green << 8) | blue;
        }
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
      // 绘制人脸框
      if (frameDetect) {
        frameDetect.forEach((detect) => {
          if (detect && detect.hasFace) {
            const { faceX, faceY, faceW, faceH } = detect.faceInfo;
            BGRUtil.drawFaceLine(bitmap, width, height, faceX, faceY, faceW, faceH);
          }
          if (detect && detect.hasFace && !this.hasSayHello) {
            console.log(`打招呼了`)
            this.hasSayHello = true
            this.playWakenAudio()
            if (this.sdkStatus === 1) {
              this.sendMsgToMain('window-message-from-renderer', {type: 'cmd', data: 'wakeup'})
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
      const canvas = this.$refs.overlay; // 页面中的 <canvas> 元素
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const sourceSize = {width: sourceWidth, height: sourceHeight}
        const {offsetX, offsetY, drawWidth, drawHeight} = this.resizeImageRect(sourceSize, {width: canvas.width, height: canvas.height})

        // 绘制缩放后的图像
        ctx.drawImage(canvasWithImg, 0, 0, sourceWidth, sourceHeight, offsetX, offsetY, drawWidth, drawHeight);
      }
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
        let sourceSize = {width: img.width, height: img.height}
        const {offsetX, offsetY, drawWidth, drawHeight} = this.resizeImageRect(sourceSize, {width: canvas.width, height: canvas.height})
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

      return {offsetX, offsetY, drawWidth, drawHeight}
    },

    // --------------------------------添加手势--------------------------------------
    registerGestures() {
      document.body.addEventListener('touchstart', (event) => {
        this.startX = event.touches[0].clientX;
        this.isDragging = true;
      })
      document.body.addEventListener('touchmove', (event) => {
        if (!this.isDragging) return
        const currentX = event.touches[0].clientX
        const diff = currentX - this.startX
        console.log(`滑动x: ${diff}`)
        if (diff > 100) {
          this.sendMsgToMain('toggle-fullscreen')
          this.isDragging = true
        }
      })
      document.body.addEventListener('touchend', () => {
        this.isDragging = false;
      });
    },

    scrollToAnswerBottom() {
      this.$nextTick(() => {
        setTimeout(() => {
          const answeringBox = this.$refs.answeringBox
          if (answeringBox) {
            // console.log(`设置滚动高度 ${answeringBox.scrollHeight}`)
            answeringBox.scrollTop = answeringBox.scrollHeight
          }
        }, 300)
      })
    },

    observeAnsweringBox() {
      const answeringBox = this.$refs.answeringBox;
      if (answeringBox) {
        const observer = new MutationObserver(() => {
          this.scrollToAnswerBottom();
        });
        observer.observe(answeringBox, {
          childList: true,    // 监听子元素变化
          subtree: true,      // 监听所有子孙元素
          characterData: true // 监听文本内容的变化
        });
      }
    },

    sendMsgToMain(channel, args=null) {
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
      this.showQuestionBox = false
      this.curQuestion = null
      this.curSrResult = ""
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
      this.showUserGuide = true
    },

    showUserGuidePic() {
      this.userGuideIndex = 0
    },

    userGuideClick() {
      this.userGuideIndex += 1
      if (this.userGuideIndex > this.userGuideSteps.length - 1) {
        this.userGuideIndex = 0
        this.showUserGuide = false
      }
    },
  }
}
</script>


<style scoped>
  /* 隐藏水平和垂直滚动条 */
  ::-webkit-scrollbar {
    display: none; /* 对于 Webkit 内核浏览器，如 Chrome 和 Safari */
  }

  html {
    -ms-overflow-style: none;  /* 对于 Internet Explorer 和 Edge */
    scrollbar-width: none;  /* 对于 Firefox */
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
    background-color: rgba(70,130,180,0.7);
  }

  .seperate-line {
    width: 100%;
    height: 2px;
    background-color: #ececec;
  }

  .answer-box {
    width: calc(100% - 20px);
    font-size: 30px;
    color: white;
    flex: 1;
    padding: 10px 10px;
    background-color: rgba(135,206,250, 0.8);
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

  ::v-deep .el-table__body tr.current-row > td {
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
</style>