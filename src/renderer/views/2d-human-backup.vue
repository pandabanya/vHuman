<template>
  <div class="content-pannel">
    <div class="video-pannel">
<!--      :poster="require('../assets/hostee.jpg')"-->
      <video id="video" class="video-control-box video-fill" loop="loop" preload="auto" :poster="require('../assets/hostee.png')">
<!--        <source :src="require('../assets/test.mp4')">-->
        <source :src="videoUrl">
      </video>

<!--      &lt;!&ndash; 用法说明 &ndash;&gt;-->
<!--      <div class="left-hint">-->
<!--        <img :src="require('../assets/hint.png')"></img>-->
<!--        <div>与我交流，请先说：小溪小溪。</div>-->
<!--      </div>-->
      <!-- 正在语音识别标识 -->
      <div class="reging-gif" v-if="isRecognizing">
        <img :src="require('../assets/round.gif')">
      </div>

      <!-- 摄像头数据 -->
      <div class="camera-panel" ref="cameraPanel">
        <video class="camera-content" ref="camera" autoplay playsinline></video>
        <canvas class="camera-overlay" ref="overlay" />
      </div>

      <!-- 回答  -->
      <div class="content-box" ref="container">
        <div class="item-panel" v-if="curSrResult.length > 0">
          <div class="question">
            <div class="text-panel out">{{ curSrResult }}</div>
          </div>
        </div>
        <div v-for="(item, index) in qaList" :key="index" class="item-panel">
          <!-- 答  -->
          <div class="answer">
            <!-- 头像  -->
            <!--            <div class="header-panel"><el-image style="width: 50px; height: 50px" :src="require(`../assets/answer.png`)"></el-image></div>-->
            <div class="content-panel">
              <div v-if="index === 0">
                <div class="in" v-if="pageStatus === 14 && item.answer && item.answer.length > 0" v-html="item.answer"></div>
                <div class="in" v-else-if="pageStatus >= 9 && pageStatus < 14">
                  <!-- 内容  -->
                  <div v-if="showAnswer && showAnswer.length > 0">
                    {{ showAnswer }}
                  </div>
                  <div v-else></div>
                </div>
                <div class="ref-doc-list in" v-else-if="pageStatus >= 7 && pageStatus < 9">
                  <div v-if="item.selectedIndex===-1">
                    <div class="ref-doc-hint">请触屏选择或语音说出您想要了解的政策文件序号：</div>
                    <div style="margin-top: 10px">
                      <el-table width="100%" :data="item.refList" border stripe :highlight-current-row="index === 0" @current-change="refListSelected">
                        <el-table-column type="index" label="序号" width="50" align="center"></el-table-column>
                        <el-table-column prop="fileName" label="文件名称"></el-table-column>
                      </el-table>
                    </div>
                  </div>
                  <div v-else>
                    <div class="ref-doc-hint in">您选择了解的政策文件名称是：{{ item.refList[item.selectedIndex].fileName }}</div>
                  </div>
                </div>
                <div v-else></div>
              </div >
              <div v-else>
                <div class="in" v-html="item.answer" v-if="item.answer && item.answer.length > 0"></div>
                <div v-else></div>
              </div>
            </div>
          </div>
          <!-- 问  -->
          <div class="question">
            <!-- 内容  -->
            <div class="text-panel out">{{item.question}}</div>
            <!-- 头像  -->
            <!--            <div class="header-panel"><el-image style="width: 50px; height: 50px" :src="require(`../assets/question.png`)"></el-image></div>-->
          </div>
        </div>
      </div>
      <audio id="audio" :src="resultAudioUrl"></audio>
    </div>
  </div>
</template>

<script>
import {get_ref_doc_list} from "../api/common";
const { ipcRenderer } = require('electron')
import {
  setUpWakenSDK,
  endWakeupSession,
  startSpeechRecognition,
  reWaken,
  changeSdkStateFromPage,
  stopSrTimer
} from '../utils/ance-waken-koffi'
import AnceRecorder from "../utils/ance-recorder";
import AnceStreamAudioPlayer from "../utils/ance-stream-audio-player";
import ANCETtsSocketService from "../utils/ance-tts-socket";
const faceapi = require('@vladmandic/face-api');


export default {
  name: 'VHuman',
  data() {
    return {
      baseUrl: process.env.VUE_APP_BASE_API,
      noAnswer: '我在文件库中无法找到您问题的相关参考文件，暂时无法回答您的问题。',
      result: '',
      resultAudioUrl: "",
      anceRecorder: null,
      wavFileTimerId: null,
      needStartVad: false,
      needReWaken: false,

      // 视频播放器
      isPlaying: false,
      videoPlayerPromise: null,
      videoUrl: null,

      // 网络连接
      isConnected: true,

      // 问题-答案列表
      qaList: [],
      // qaList: [
      //   {'question':'你是谁', 'answer':'我叫小溪', 'selectedIndex': -1, 'refList':[{'id': '123', 'fileName': '小彗星旅行记'}, {'id': '456', 'fileName': '数学来了'}]},
      //   {'question':'关于魏桥镇2024年预防青少年溺水的专题政策信息，虽然具体的细节未直接提及，但可以参照相似背景下的合市镇2024年预防青', 'answer':'...', 'selectedIndex': -1}
      // ],

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

      // 正在回答问题的序号
      answerIndex: 0,
      retryTimes: 0,

      // 取消请求使用
      cancel: null,

      // sdk状态（未使用）  1 未唤醒  2 唤醒成功  3 语音识别中  4 语音识别成功  5 语音识别失败
      sdkStatus: 1,
      // 页面状态  6 获取参考资料中  7 获取参考资料成功  8 获取参考资料失败  9 获取答案中  10 获取答案成功
      // 11 获取答案失败   12 合成语音答案中  13 语音播报中  14 完成回答
      pageStatus: 14,

      // 中文数词和阿拉伯数字转换
      chnNumberChar: {
        零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10
      },

      // 人脸检测worker是否准备好
      isWorkerReady: false,
      lastSentTime: 0,   // 上次发送时间
      sendInterval: 500, // 每 200 毫秒发送一次帧（约 5 帧/秒）
      cameraDims: 4/3,
      cameraWidth: 1080/1920 * 400,
      cameraHeight: 0,

      // 一段时间内人脸检测和嘴巴是否张开的结果
      durationResult: [],
      duration: 5,   // 检测时长，单位是秒
      mouthOpenThreshold: [40, 40],   // 开口的阈值, [打断值， 语音识别值]
      faceThreshold: 100,  // 人脸出现的概率
      wakenFaceThreshold: 100,

      // 是否全屏手势
      startX: 0,
      isDragging: false,
    }
  },
  created() {
    this.$ANCESocket.connect(this)
    this.ttsWebsocket = new ANCETtsSocketService(this.ttsAudioStart, this.ttsPlayStop)
    this.login()
    this.setUpNetworkTimer()
    setUpWakenSDK(this.sdkStatusCallback, false)
    this.videoUrl = process.env.VUE_APP_MINIO_URL + "test.mp4"
    this.setupWorkerNotify()
  },
  beforeDestroy() {
    endWakeupSession()
  },
  watch:{
    isConnected(newVal, oldVal) {
      if (newVal !== oldVal) {
        this.$message.info(newVal ? '网络已连接' : '网络已断开')
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
    this.registerGestures()
    this.initRecorder()
    this.startCamera()
  },
  methods: {
    // onResize() {
    //   this.width = window.innerWidth
    //   this.height = window.innerHeight
    //   console.log(`window width: ${this.width}, height: ${this.height}`)
    // },

    login() {
      this.$store.dispatch('login')
    },
    // 初始化录
    initRecorder() {
      this.anceRecorder = new AnceRecorder()
      this.streamAudioPlayer = new AnceStreamAudioPlayer(this.startPlayVideo, this.ttsPlayStop)
      let that = this
      this.audioPlayer.addEventListener('ended', function () {
        console.info('-----audio end----')
        if (that.needStartVad) {
          setTimeout(() => {
            that.startVad()
          }, 500)
          that.needStartVad = false
        }
        if (that.needReWaken) {
          setTimeout(() => {
            // that.reWakenSDK()
            that.startVad()
          }, 500)
          that.needReWaken = false
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
      this.sdkStatus = sdkState
      switch (sdkState) {
        case 1:
          this.clearDurationResult()
          if (this.pageStatus === 7) {
            this.retryTimes += 1
            if (this.retryTimes >= 3) {
              this.asrSelectIndex(1)
              this.retryTimes = 0
            }
          }
          break;
        case 2:
          // 唤醒成功
          this.wakenSuccessHandler()
          break;
        case 3:
          // 语音识别中
          this.changeSRStatus(true)
          break;
        case 4:
          // 语音识别成功
          this.srSuccess(data, isSrEnded)
          if (isSrEnded) {
            this.changeSRStatus(false)
            this.clearDurationResult()
          }
          break;
        case 5:
          this.changeSRStatus(false)
          break;
        default:
          break;
      }
    },

    // ---------------- 语音检测  ----------------
    startVad() {
      this.clearDurationResult()
      startSpeechRecognition()
    },

    // 获取语音识别结果
    srSuccess(singleResult, isEnded) {
      if ("" === singleResult || null == singleResult) {
        return
      }
      if (!isEnded) {
        // 未完成识别
        this.curSrResult += singleResult
        return
      }
      if (singleResult.length < 5 && this.pageStatus > 8 ) {
        this.curSrResult = ""
        this.clearDurationResult()
        let that = this
        setTimeout(() => {
          that.startVad()
        }, 1000)
        return
      }
      this.curSrResult = singleResult
      let result = singleResult
      this.curSrResult = ""
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
          }
        }
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

      let mouthValid = this.interruptMouthValid()
      if (!mouthValid) {
        console.info('请摄像头上框住脸的人说话')
        this.startVad()
        return
      }
      this.handlePageStatus()
      this.containerToPosition(true)

      let index = this.qaList.findIndex(item => item.question === result)
      console.info('--是否存在相同问题--', (index === -1) ? '否' : '是')
      if (index !== -1) {
        let oldQuestion = this.qaList[index]
        let question = Object.assign({}, oldQuestion)
        this.qaList.unshift(question)

        console.info('全部问题', this.qaList)

        if (question.answer && question.answer.length > 0) {
          this.pageStatus = 12
          // 走客户端的tts
          this.toTTSAnswer = question.answer
          this.startStreamTTSTimer()
          this.fakeStreamText()
          this.reWakenSDK()
          return
        }
      }

      this.pageStatus = 6

      let qa = {"question": result, "answer": "", "url": null, refList: [], originRefList: [], selectedIndex:-1}
      this.qaList.unshift(qa)
      console.info('全部问题', this.qaList)

      // 请求参考文件列表
      let param = {'question': result}
      let that = this
      get_ref_doc_list(param, this).then((res) => {
        that.pageStatus = 7
        that.toTTSAnswer = ""
        let oqa = that.qaList[that.answerIndex]
        let data = JSON.parse(res.data)
        // console.info('去重前：', data)
        if (data && data instanceof Array && data.length > 0) {
          // 处理
          oqa.originRefList = data
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
          oqa.refList = itemList
          console.info('去重后：', itemList)
        } else {
          that.pageStatus = 12
          oqa.refList = null
          oqa.originRefList = null
          oqa.answer = that.noAnswer
          that.toTTSAnswer = that.noAnswer
          that.startStreamTTSTimer()
          that.fakeStreamText(false)
          that.reWakenSDK()
        }
      }).catch((error) => {
        console.info(error)
        this.pageStatus = 8
      })
    },

    asrSelectIndex(selectedRefIndex) {
      selectedRefIndex -= 1
      console.info('语音选择的文件序号是：', selectedRefIndex)
      let question = this.qaList[this.answerIndex]
      if (selectedRefIndex >= 0 && selectedRefIndex < question.refList.length) {
        let selectedRow = question.refList[selectedRefIndex]
        this.refListSelected(selectedRow)
      } else {
        console.info('选择的文件序号超过参考文件列表长度')
        this.playOutboundListAudio()
      }
    },

    // 处理参考文件列表被选择
    refListSelected(currentRow) {
      stopSrTimer()
      this.playWaitingAudio()
      let refList = this.qaList[this.answerIndex].originRefList
      let ids = refList.filter(item => {
        return item.fileName === currentRow.fileName
      }).map(item => item.id)
      // console.info('--ids--', ids)
      if (ids && ids.length > 0) {
        this.pageStatus = 9
        this.sendWSMessage(this.qaList[this.answerIndex].question, ids)
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
        refId: refIds
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
        let qaItem = this.qaList[this.answerIndex]
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
        console.info('--receiveWebsocketMsg qaList--', this.qaList)
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
        // console.info('---play local url----', url)
        this.resultAudioUrl = require(`../assets/${url}`)
      } else {
        this.resultAudioUrl = process.env.VUE_APP_MINIO_URL + url
        // console.info('---play remote url----', this.resultAudioUrl)
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
    startStreamTTSTimer() {
      if (this.streamTTSTimer) return
      // console.log('----startStreamTTSTimer----')
      this.streamTTSTimer = setInterval(() => {
        this.pageStatus = 12
        if (this.sendedLength < this.toTTSAnswer.length) {
          let toSendLength = this.toTTSAnswer.length - this.sendedLength
          let sendText = this.toTTSAnswer.substr(this.sendedLength, toSendLength)
          // 连接websocket
          // 发送数据
          this.ttsWebsocket.connect(this)
          this.ttsWebsocket.send(this, 'Audio', sendText)
          this.sendedLength += toSendLength
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
          // this.containerToBottom()
        }, 500)
      }
    },

    containerToPosition(top=false) {
      if (top) {
        let container = this.$refs.container
        container.scrollTop = 0
      } else {
        let container = this.$refs.container
        container.scrollTop = container.scrollHeight
      }
    },

//------------------------- 重新唤醒SDK -----------------------------------

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
      } else {
        this.showedIndex = 0
        this.showAnswer = ""
        this.toTTSAnswer = ""
        this.sendedLength = 0
      }
    },

    reWakenSDK() {
      console.info('需要重新唤醒SDK')
      reWaken()
    },

    reWakenSDKCallback() {
      if (this.pageStatus === 7) {
        console.info('用户没有在规定的时间内选择参考文件，默认选择了0')
        this.asrSelectIndex(1)
      }
    },

    //---------------------- 摄像头 ------------------------------

    // 开启监听worker通知
    setupWorkerNotify() {
      ipcRenderer.on('message-from-worker', (event, args) => {
        // console.log('renderer收到worker线程通知')
        if (args.type === 'ready') {
          this.isWorkerReady = true
        } else if (args.type === 'result') {
          this.drawCameraResult(args.data)
        }
      })
    },

    // 开启摄像头
    async startCamera() {
      try {
        navigator.mediaDevices.getUserMedia({
          video: true
        }).then(stream => {
          this.$refs.camera.srcObject = stream;
        }).catch(error => {
          console.error('Error accessing camera:', error);
        });
        this.$refs.camera.onplay = () => {
          this.sendCameraDataToWorker()
        }
      } catch (error) {
        console.error('Error accessing the camera:', error);
      }
    },

    sendCameraDataToWorker() {
      const now = Date.now();
      if (now - this.lastSentTime > this.sendInterval) {
        const camera = this.$refs.camera
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        this.cameraDims = camera.videoWidth / camera.videoHeight
        this.cameraHeight = this.cameraWidth / this.cameraDims
        const scale = 2.5

        // console.log(`摄像头显示框宽：${this.cameraWidth}, 高：${this.cameraHeight}`)
        canvas.width = camera.videoWidth
        canvas.height = camera.videoHeight

        let visibleWidth = canvas.width / scale
        let visibleHeight = canvas.height / scale

        // 计算中心点的裁剪起始坐标
        const startX = (camera.videoWidth - visibleWidth) / 2
        const startY = (camera.videoHeight - visibleHeight) / 2

        console.log(`x: ${startX}, y: ${startY}, 图像宽：${visibleWidth}, 高：${visibleHeight}`)
        // ctx.drawImage(camera, 0, 0, canvas.width, canvas.height);
        ctx.drawImage(camera, startX, startY, visibleWidth, visibleHeight, 0, 0, canvas.width, canvas.height);

        // 使用ArrayBuffer
        canvas.toBlob(blob => {
          const reader = new FileReader()
          reader.onloadend = () => {
            const arrayBuffer = reader.result
            if (this.isWorkerReady && arrayBuffer.byteLength > 0) {
              ipcRenderer.send('window-message-from-renderer', { type: 'image', data: arrayBuffer })
            }
          }
          reader.readAsArrayBuffer(blob)
        }, 'image/jpeg', 0.5)

        this.lastSentTime = now;
      }
      requestAnimationFrame(this.sendCameraDataToWorker);
    },

    drawCameraResult(detection) {
      if (detection) {
        const detectionObj = JSON.parse(detection);
        // console.log('---result:', detectionObj);
        const restoredDetection = this.parseLandmarksResult(detectionObj)
        // console.log('restoreResult:', restoredDetection)
        // console.log('mouthOpen:', restoredDetection[1].mouthOpen)
        const canvas = this.$refs.overlay
        const ctx = canvas.getContext('2d');
        // 清除上一次绘制的内容
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        console.log(`sdkStatus: ${this.sdkStatus}, pageStatus: ${this.pageStatus}`)
        if (this.sdkStatus === 1) {
          this.durationResult.push(restoredDetection[1])
          this.wakenUpFaceHandler()
        } else if (this.sdkStatus === 3) {
          this.durationResult.push(restoredDetection[1])
        }

        if (restoredDetection[1].detectionFace) {
          const displaySize = {width: this.cameraWidth, height: this.cameraHeight}
          const dims = faceapi.matchDimensions(canvas, displaySize)
          // console.log('dims:', dims)
          const resizedDetections = faceapi.resizeResults(restoredDetection[0], dims)
          // console.log('resizedDetections:', resizedDetections)
          // draw detections into the canvas
          faceapi.draw.drawDetections(canvas, resizedDetections)
        }
      }
    },

    parseLandmarksResult(detectionObj) {
      const { detection, landmarks } = detectionObj
      let detectionFace = false
      const mouthOpen = landmarks.mouthOpen
      let faceDetection = null

      if (Object.keys(detection).length > 0) {
        detectionFace = true
        faceDetection = new faceapi.FaceDetection(
            undefined,
            {
              x:detectionObj.detection.relativeBox._x,
              y:detectionObj.detection.relativeBox._y,
              width:detectionObj.detection.relativeBox._width,
              height:detectionObj.detection.relativeBox._height
            },
            {
              width: detectionObj.detection.imageDims._width,
              height: detectionObj.detection.imageDims._height
            }
        );
      }

      return [faceDetection, {detectionFace: detectionFace, mouthOpen: mouthOpen}]
    },

    //----------------------------------------------------------------------------------------
    // type 1:唤醒  2：语音识别  3:打断
    getFaceMouthHandlerList(type) {
      console.log(`type: ${type}`)
      let startIndex = 0
      let endIndex = 0
      const objIndex = this.durationResult.length - 1
      let toCheckNum = 0
      if (type === 1) {
        toCheckNum = this.duration * 1000 / this.sendInterval
        startIndex = objIndex - toCheckNum + 1
        endIndex = objIndex + 1
      } else if (type === 2 || type === 3) {
        toCheckNum = this.durationResult.length - (2 * 1000 / this.sendInterval)
        startIndex = 0
        endIndex = toCheckNum
      }
      if (toCheckNum < 0 || this.durationResult.length < toCheckNum) {
        return null
      }
      console.log(`to check list ${toCheckNum}, startIndex ${startIndex}, endIndex ${endIndex}`)
      return this.durationResult.slice(startIndex, endIndex)
    },

    wakenUpFaceHandler() {
      let type = 1
      if (this.pageStatus === 12 || this.pageStatus === 13) {
        type = 3
      }
      const toCheckList = this.getFaceMouthHandlerList(type)
      const facePass = this.faceDetectionValid(toCheckList, this.wakenFaceThreshold)
      if (!facePass) {
        return
      }
      if (this.pageStatus === 14) {
        this.durationResult = []
        // 不管pageStatus，直接变成唤醒状态  语音问好
        changeSdkStateFromPage(2)
      } else if (this.pageStatus === 12 || this.pageStatus === 13 || this.pageStatus <= 8) {
        setTimeout(() => {
          this.startVad()
        }, 500)
      }
    },

    // 语音识别或者打断
    interruptMouthValid() {
      const toCheckList = this.getFaceMouthHandlerList(3)
      const facePass = this.faceDetectionValid(toCheckList, this.faceThreshold)
      if (!facePass) {
        return false
      }
      let mouthOpenNum = 0
      toCheckList.forEach((result) => {
        if (result.mouthOpen) {
          mouthOpenNum += 1
        }
      })
      return this.calcRate(toCheckList.length, mouthOpenNum, this.mouthOpenThreshold[0])
    },

    // 人脸检测结果
    faceDetectionValid(faceData, threshold) {
      const toCheckList = faceData
      if (null == toCheckList) {
        return false
      }
      let faceNum = 0
      toCheckList.forEach((result) => {
        if (result.detectionFace) {
          faceNum += 1
        }
      })
      let facePass = this.calcRate(toCheckList.length, faceNum, threshold)
      console.log('人脸检测结果：', facePass)
      return facePass
    },

    // 计算人脸检测中嘴巴的开口率
    calcRate(total, openNum, threshold) {
      if (Number.isNaN(total) || Number.isNaN(openNum)) return false
      let mouthOpenRate = Math.round(openNum * 100 / total)
      let mouthPass = mouthOpenRate >= threshold
      console.log(`检测对象数：${total}, 开口对象数：${openNum}, 开口率：${mouthOpenRate}`)
      return mouthPass
    },

    // 清空人脸检测结果数组
    clearDurationResult() {
      this.durationResult = []
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
          ipcRenderer.send('toggle-fullscreen')
          this.isDragging = true
        }
      })
      document.body.addEventListener('touchend', () => {
        this.isDragging = false;
      });
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
  .audio-pannel{
    width: 100%;
    height: 500px;
    display: flex;
    justify-content: space-evenly;
    align-items: center;
  }
  .content-box {
    width: 100%;
    height: 50%;
    position: absolute;
    bottom: 0;
    left: 0;
    /*border: #e1f3d8 1px solid;*/
    border-radius: 4px;
    z-index: 1050;
    /*background-color: rgba(1, 1, 1, 0.2);*/
    overflow-y: scroll;
  }

  .item-panel {
    width: calc(100% - 40px);
    display: block;
    font-size: 24px;
    margin: 10px 20px;
  }
  .question{
    width: 100%;
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
    margin: 5px 0;
  }
  .answer{
    width: 100%;
    display: flex;
    justify-content: flex-start;
    align-items: flex-start;
    text-align: left;
  }
  .header-panel {
    width: 50px;
    height: 50px;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .content-panel {
    margin: 0 10px;

    width: calc(100% - 180px);
    word-break: break-all;
    word-wrap: break-word;
    white-space: pre-wrap;
    text-align: left;
  }
  .text-panel {
    margin: 0 10px;
    border-radius: 5px;
    padding: 10px;
    max-width: calc(100% - 180px);
    word-break: break-all;
    word-wrap: break-word;
    white-space: pre-wrap;
    text-align: left;
  }
  .in {
    background-color: rgba(0, 0, 0, 0.2);
    color: white;
    padding: 10px;
    border-radius: 5px;
  }
  .out {
    background-color: rgba(30, 144, 255, 0.8);
    color: white;
    padding: 10px;
    border-radius: 5px;
  }

  .reging-gif {
    width: calc(1920 / 500 * 167px);
    height: calc(500 / 1920 * 640px);
    position: fixed;
    left: 49%;
    transform: translateX(-50%);
    top: 500px;
    z-index: 3000;
  }

  .reging-gif img {
    width: calc(1920 / 500 * 167px);
    height: calc(500 / 1920 * 640px);
    border-radius: 68px;
    background-color: rgba(0, 0, 0, 0.2);
  }

  .left-hint {
    position: absolute;
    left: 50px;
    top: 50px;
    z-index: 3000;
    background: rgba(255, 228, 196, 0.6);
    padding: 10px 10px 10px 10px;
    border-radius: 10px;
    font-size: 24px;
    color: #333333;
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
    height: calc(3/4 * 1080/1920 * 400px);
    z-index: 3500;
    overflow: hidden;
  }

  .camera-content {
    top: 0;
    right: 0;
    width: 100%;
    height: auto;
    transform: scale(2.5); /* 放大 1.5 倍 */
    transform-origin: center; /* 设定放大基点 */
    position: absolute;
  }

  .camera-overlay {
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    right: 0;
    z-index: 4000;
  }

  .cur-sr-result-panel {
    width: calc(100% - 40px);
    display: block;
    font-size: 24px;
    margin: 10px 20px;
  }
</style>