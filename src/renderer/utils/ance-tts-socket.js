import AudioPlayer from "../player/index.umd";
import CryptoJS from './crypto-js'

export default class ANCETtsSocketService {

    // instance = null; // 单例

    ws = null; // 和服务端连接的socket对象

    isConnecting = false; // 是否正在重连
    connected = false; // 标识是否连接成功
    sendRetryCount = 0; // 记录重试的次数

    audioPlayer = null;
    playStopCallback = null;
    playingCallback = null;

    audioDataBuffer = null;
    isPlayerStarted = false;

    index = 0;   // stmid 字段的序号，值的取值为 text_${index}，当连接断开后可以重置元素值

    scene = 'IFLYTEK.tts'//process.env.NODE_ENV !== 'production' ? 'main_box' : 'main'

    constructor(playingCb, playStopCb) {
        if (!ANCETtsSocketService.instance) {
            ANCETtsSocketService.instance = this;
            this.playingCallback = playingCb
            this.playStopCallback = playStopCb
            this.initAudioPlayer()
        }
        return ANCETtsSocketService.instance;
    }

    initAudioPlayer() {
        // this.audioPlayer = new AudioPlayer("../player");
        this.audioPlayer = new AudioPlayer(".");
        this.audioPlayer.onPlay = () => {
            console.log('----stream play----')
            if (this.playingCallback) {
                this.playingCallback()
            }
        };
        this.audioPlayer.onStop = (audioDatas) => {
            // console.log(audioDatas);
            this.isPlayerStarted = false
            this.startPlayer()
            if (this.playStopCallback) {
                this.playStopCallback()
            }
            console.log('----stream stop----')
        };
    }

    startPlayer() {
        if (!this.isPlayerStarted) {
            this.audioPlayer.start({
                autoPlay: true,
                sampleRate: 16000,
                resumePlayDuration: 1000
            });
            this.isPlayerStarted = true
        }
    }

    // 讯飞AIUI平台大模型交互tts协议
    getWebSocketUrl(apiKey, apiSecret) {
        let url = "wss://aiui.xf-yun.com/v2/aiint/ws";
        const host = "aiui.xf-yun.com";
        const date = new Date().toGMTString();
        const algorithm = "hmac-sha256";
        const headers = "host date request-line";
        const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/aiint/ws HTTP/1.1`;
        const signatureSha = CryptoJS.HmacSHA256(signatureOrigin, apiSecret);
        const signature = CryptoJS.enc.Base64.stringify(signatureSha);
        const authorizationOrigin = `api_key="${apiKey}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`;
        const authorization = btoa(authorizationOrigin);
        url = `${url}?authorization=${authorization}&date=${date}&host=${host}`;
        return url;
    }

    encodeText(text, type) {
        if (type === "unicode") {
            let buf = new ArrayBuffer(text.length * 4);
            let bufView = new Uint16Array(buf);
            for (let i = 0, strlen = text.length; i < strlen; i++) {
                bufView[i] = text.charCodeAt(i);
            }
            let binary = "";
            let bytes = new Uint8Array(buf);
            let len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return window.btoa(binary);
        } else {
            // return Base64.encode(text);
            return Buffer.from(text, 'utf-8').toString('base64')
        }
    }

    // 连接服务器的方法
    connect(vNode) {
        // 这里判断你的浏览器支不支持websocket
        if (!window.WebSocket) {
            return this.print("您的浏览器不支持WebSocket");
        }
        if (this.isConnecting)
            return

        this.isConnecting = true
        const url = this.getWebSocketUrl(process.env.VUE_APP_TTS_APP_KEY, process.env.VUE_APP_TTS_APP_SECRET)
        this.ws = new WebSocket(url);
        //连接成功
        this.ws.onopen = () => {
            this.print("tts socket connected");
            this.connected = true
            this.isConnecting = false
            this.startPlayer()
            this.index = 0
        };
        //连接关闭
        this.ws.onclose = (e) => {
            console.error(`tts receive socket closed: `, e);
            this.connected = false;
            this.isConnecting = false
        };
        // 连接失败
        this.ws.onerror = () => {
            this.print("socket error");
            this.connected = false;
            this.isConnecting = false;
        };
        this.ws.onmessage = (e) => {
            try {
                let jsonData = JSON.parse(e.data);
                let header = jsonData.header
                const code = header.code
                // 合成失败
                if (code !== 0) {
                    console.error(jsonData);
                    // this.close()
                    return
                }
                if ('payload' in jsonData) {
                    const payLoad = jsonData['payload']
                    // const keys = Object.keys(payLoad)
                    // console.log(`tts payload keys: `, keys)
                    if ('tts' in payLoad) {
                        const ttsObj = payLoad['tts']
                        const audioData = ttsObj['audio']
                        if (audioData) {
                            this.audioPlayer.postMessage({
                                type: "base64",
                                data: audioData,
                                isLastData: ttsObj.status === 2,
                            });
                        }
                    }
                }
                // if ('status' in header && header['status'] === 2) {
                //     this.print('主动关闭ws')
                //     this.ws.close();
                // }
            } catch (err) {
                if (typeof e.data == "string") this.print(e.data);
                else console.error(err);
            }
        };
    }

    close() {
        if (this.ws) {
            this.print('主动关闭ws')
            this.ws.close()
        }
        this.connected = false
        this.isConnecting = false
        this.audioPlayer.stop()
        this.audioPlayer.reset()
        this.isPlayerStarted = false
    }

    //销毁回调函数
    unSubscribe() {
        //停止消息发送
        this.subscribeMap.clear();
    }

    subscribeMap = new Map(); //记载回调函数

    // 注册
    onmessage(v, key, callback) {
        if (!this.connected) {
            this.connect(v);
        }

        if (this.subscribeMap.has(key)) {
            const saveData = this.subscribeMap.get(key);
            saveData[v.$options.name].cb = callback;
        }
        // 不存在则创建
        else {
            this.subscribeMap.set(key, {
                [v.$options.name]: {
                    _saveVNode: v,
                    cb: callback
                },
            });
        }
    }

    // 发送数据的方法
    // v - vue 实例
    // key - 接收值的type
    // val - 请求数据
    // callback - 返回回调 (如果为 null 则仅发送)
    send(v, key, val, callback = null) {
        const sendArgs = [v, key, JSON.parse(JSON.stringify(val)), callback]
        //判断此时有没有ws
        if (!this.connected) {
            this.connect(v);
            setTimeout(() => {
                this.send(...sendArgs);
            }, 500)
        } else {
            // 判断此时此刻有没有连接成功
            if (this.connected) {
                //存储回调函数 - 根据 vue component name 区分
                if (callback != null) {
                    this.onmessage(v, key, callback)
                }
                this.sendRetryCount = 0;
                this.tts_send(sendArgs)
            } else {
                this.reConnect(sendArgs)
            }
        }
    }

    reConnect(sendArgs) {
        this.sendRetryCount++;
        setTimeout(() => {
            this.send(...sendArgs);
        }, this.sendRetryCount * 500);
    }

    tts_send(sendArgs) {
        const val = sendArgs[2]
        const type = "UTF8"
        let params = {
            "header": {
                "sn": process.env.VUE_APP_TTS_SN,
                "appid": process.env.VUE_APP_TTS_APPID,
                "stmid": `text-${this.index++}`,  // 会话id，用于标记不同会话
                "status": 3,
                "scene": this.scene
            },
            "parameter": {
                "tts": {
                    "vcn": "x2_xiaojuan",
                    "tts": {
                        "channels": 1,
                        "sample_rate": 16000,
                        "bit_depth": 16,
                        "encoding": "raw"
                    },
                    "volume": 100,
                    "speed": 40
                }
            },
            "payload": {
                "text": {
                    "compress": "raw",
                    "format": "plain",
                    "text": this.encodeText(val, type),   // 需经base64编码
                    "encoding": "utf8",
                    "status": 3
                }
            }
        }
        try {
            this.ws.send(JSON.stringify(params));
            this.print('发送ws消息')
        } catch (e) {
            console.error(e)
            this.reConnect(sendArgs)
        }
    }

    print(text) {
        console.log(
            "%c[ance tts socket service]%c " + text,
            "color:#fff;background:#008000;",
            "color:#000;"
        );
    }
}
