# 点击之后流程梳理
## 详细实现流程
### 第一步：程序启动
1. 程序启动时会加载主界面组件并初始化各种服务
```javascript
//Vue项目启动
// 路由啥的  router.js
// 主界面组件 2d-human.vue
```
2. 在主组件创建时，会连接WebSocket服务器、初始化TTS服务、设置工作进程通信
```javascript
// 2d-human.vue
 created() {
    this.$ANCESocket.connect(this)
    this.ttsWebsocket = new ANCETtsSocketService(this.ttsAudioStart, this.ttsPlayStop)
    this.login()
    this.setUpNetworkTimer()
    this.videoUrl = process.env.VUE_APP_MINIO_URL + "test.mp4"
    this.setupWorkerNotify()
  },
```

3. 同时启动串口工作进程，用于与AIUI语音识别硬件通信
```javascript
// serialWorker.js
requestSerial().then( () => {
    console.log('serial worker 启动完成')
    ipcRenderer.on('message-from-renderer', (event, msg) => {
        console.log('receive message-from-renderer', msg)
        if (msg.type === 'cmd') {
            sendCMDMsgToAIUI(msg.data)
        } else if (msg.type === 'continue_vad') {
            // 用户选择继续，清除暂停定时器
            if (vadPauseTimer) {
                clearTimeout(vadPauseTimer);
                vadPauseTimer = null;
            }
        }
    })
})
```

### 第二步：点击提问按钮
1. 用户点击"点我提问"按钮时，触发交互模式切换
```html
<div class="ask-question-box" id="askQuestionBox" @click="askQuestionClick" v-if="showAskQuestion" >
    <img :src="require('../assets/hostee-small.png')" class="ask-question-img" v-show="showOriginText"/>
    <el-button  ref="askQuestion" id="askQuestion" round type="primary" class="ask-question-hint">点我提问</el-button>
</div>
```
2. 切换到交互模式会启动摄像头显示和人脸检测功能
```javascript
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
```
```javascript
watch:{
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


      this.stepIntentRecognize(result)
    },
}

```

### 第三步：摄像头启动和人脸检测
1. 程序会建立视频Socket连接来获取摄像头数据
```javascript
    // methods里
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
```

2. VideoSocketClient负责接收摄像头的视频帧数据和人脸检测信息
src/renderer/iflySocket/VideoSocketClient.js
```javascript
    // 连接服务器
    connect() {
        // console.log('VideoSocketClient start connect...')
        this.client = new net.Socket();
        this.client.connect(this.port, this.ip, () => {
            console.log('VideoSocketClient Connected');
            this.emit('connectSuccess');
            this.connected = true;
        });

        this.client.on('data', (data) => {
            this.recvData(data);
        });

        this.client.on('close', () => {
            console.log('Connection closed');
            this.emit('disconnect');
            this.connected = false;
        });

        this.client.on('error', (error) => {
            console.error('Connection error:', error);
            this.emit('disconnect');
            this.connected = false;
        });
    }
```
3. 当检测到人脸时，会处理人脸信息并绘制人脸框
```javascript
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
```

### 第四步：语音唤醒和识别
1. 检测到人脸后如果还没有打过招呼，系统会自动播放问候语音并触发语音唤醒
```javascript
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
```

2. AIUI硬件被唤醒后，串口工作进程会收到唤醒事件
src/worker/serialWorker.js
```javascript
    // 唤醒事件
    printAIUIMsg(`3588已被唤醒`)
    sendMsgToRenderer({type: 'awake', data: ""})
    canInteractive = true
    resetIATParam()
```

3. 开始语音识别，实时接收用户的语音输入并转换为文字
使用iatParser 方法

### 第五步：语音处理和回答
1. 语音识别完成后，首先进行意图识别判断问题是否完整 
```javascript
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

```
2. 然后获取参考文档列表
```javascript
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
```

3. 用户选择或语音指定参考文档后，发送WebSocket消息获取答案
```javascript
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
```

4. 收到答案后进行流式TTS语音合成，并同步播放语音和显示文字
```javascript
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
```


这个系统采用了多进程架构，主进程负责UI交互，串口工作进程专门处理AIUI语音硬件通信，通过IPC进行进程间通信。人脸检测通过独立的视频Socket服务获取摄像头数据。整个交互流程是事件驱动的，从人脸检测触发语音唤醒，到语音识别、语义理解、答案生成和语音播报形成完整闭环。



## 语音唤醒和识别 细说 && 意图识别 细说
### src/worker/serialWorker.js 如何执行
src/worker/serialWorker.js 文件作为多进程 Electron 应用程序架构的一部分执行。主进程会创建一个工作窗口来加载并执行此脚本。

### 工作窗口创建和执行
serialWorker 在构建配置 vue.config.js:27-31 中配置为单独的页面入口点，该配置将其定义为以 src/worker/serialWorker.js 为入口点的 worker 页面。
```javascript
    worker: {// 工作线程页面配置
      entry: 'src/worker/serialWorker.js',// 串口工作线程入口
      template: 'public/worker.html',// 工作线程HTML模板
      filename: 'worker.html' // 输出文件名
    }
```

当 Electron 应用启动时，主进程通过调用 createWorkerWindow() 创建一个隐藏的工作窗口
```javascript
function createWorkerWindow(devPath, prodPath) {
  // create hidden worker window
  console.log('正在创建 Worker 窗口...');
  workerWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // 若使用 Node.js 功能时建议关闭
      webSecurity: false // 可能需要禁用以允许跨域请求
    }
  });
  if(process.env.WEBPACK_DEV_SERVER_URL) {
    console.log(`开发环境加载 URL: ${process.env.WEBPACK_DEV_SERVER_URL}/${devPath}`);
    workerWindow.loadURL(`${process.env.WEBPACK_DEV_SERVER_URL}/worker.html`);
  } else {
    console.log(`现网环境加载 URL: app://./${prodPath}`);
    workerWindow.loadURL(`app://./${prodPath}`)
  }
  ...
  ...
  createWorkerWindow('worker.html', 'worker.html')
}
```

### 从人脸检测到语音识别的转变
系统通过以下顺序从人脸检测和音频播放过渡到语音识别：
1. 人脸检测触发器 ：当在摄像头画面中检测到人脸时，drawFaceRectangle方法会处理检测结果
```javascript
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
    sendMsgToMain(channel, args=null) {
      console.log(`sendMsgToMain channel: ${channel}`)
      ipcRenderer.send(channel, args)
    },
```
检测到人脸后，如果系统尚未向用户打招呼，则会调用 playWakenAudio() 并向主进程发送“唤醒”命令。

2. 消息路由 ：渲染进程通过 IPC 向主进程发送唤醒命令，主进程再将此消息路由到工作窗口
```javascript
// 监听renderer线程发送的消息，并转发给worker线程
ipcMain.on('window-message-from-renderer', (event, args) => {
  // console.log('主线程收到来自renderer的消息，转发worker')
  if (workerWindow) {
    // 检查并转换 ArrayBuffer 为 Node.js Buffer
    if (args && args.type === 'image' && args.data instanceof ArrayBuffer) {
      const buffer = Buffer.from(args.data);
      sendWindowMessage(workerWindow, 'message-from-renderer', { type: 'image', data: buffer })
    } else if (args && args.type === 'cmd') {
      sendWindowMessage(workerWindow, 'message-from-renderer', args)
    } else {
      sendWindowMessage(workerWindow, 'message-from-renderer', { type: 'other', data: args })
    }
  }
});
```

3. 语音识别激活 ：serialWorker 接收唤醒命令并激活语音识别系统。它处理 AIUI 事件并处理语音识别结果,该工作器处理各种事件类型，包括语音识别 (ASR) 结果

4. 返回 UI 的通信 ：serialWorker 通过 IPC 消息将识别结果发送回渲染器进程，主进程将其路由到主窗口
```javascript
const sendMsgToRenderer = (msg) => {
    ipcRenderer.send('window-message-from-worker', msg)
    // parentPort.postMessage(msg)
}
```