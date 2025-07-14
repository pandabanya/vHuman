import CryptoJS from './crypto-js'

export default class ANCESocketService {
    constructor() { }

    instance = null; // 单例

    ws = null; // 和服务端连接的socket对象

    isConnecting = false; // 是否正在重连
    connected = false; // 标识是否连接成功
    sendRetryCount = 0; // 记录重试的次数

    static Instance() {
        if (!this.instance) {
            this.instance = new ANCESocketService();
        }
        return this.instance;
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
        let url = this.createSocketUrl()
        // let url = process.env.VUE_APP_WS_URL
        console.log('ws connected url:', url)
        this.ws = new WebSocket(url);
        //连接成功
        this.ws.onopen = () => {
            this.print("socket connected");
            this.connected = true;
        };
        //连接关闭
        this.ws.onclose = (e) => {
            this.print('socket closed: ', e);
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
                const { wsKey, wsValue } = JSON.parse(e.data);
                if (this.subscribeMap.has(wsKey)) {
                    const cbData = this.subscribeMap.get(wsKey);
                    Object.keys(cbData).forEach((key) => {
                        const vn = cbData[key]._saveVNode;
                        cbData[key].cb.call(vn, {
                            ...e,
                            data: wsValue,
                        });
                        // this.print(`\nmessage key: ${wsKey}\ncallback node name: ${key}`)
                    });
                }
            } catch (err) {
                if (typeof e.data == "string") this.print(e.data);
                else console.error(err);
            }
        };
    }

    close() {
        this.ws.close()
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
                this.print('发送ws消息')
                this.ws.send(
                    JSON.stringify({
                        wsKey: key,
                        wsValue: val,
                    })
                );
            } else {
                this.sendRetryCount++;
                setTimeout(() => {
                    this.send(...sendArgs);
                }, this.sendRetryCount * 500);
            }
        }
    }

    print(text) {
        console.log(
            "%c[ance socket service]%c " + text,
            "color:#fff;background:#008000;",
            "color:#000;"
        );
    }

    createSocketUrl() {
        let url = process.env.VUE_APP_WS_URL
        const timestamp = Date.now()
        let param = `AppKey=${process.env.VUE_APP_APP_KEY}&Timestamp=${timestamp}`
        const encodeParam = encodeURI(param)
        console.log(`param: ${encodeParam}`)
        const signatureSha = CryptoJS.HmacSHA256(CryptoJS.enc.Utf8.parse(encodeParam), CryptoJS.enc.Utf8.parse(process.env.VUE_APP_APP_SECRET));
        const signature = signatureSha.toString(CryptoJS.enc.Hex);
        console.log(`signature: ${signature}`)
        const beforeBase64Dict = {'appKey': process.env.VUE_APP_APP_KEY, 'timestamp':timestamp, 'signature':signature}
        const afterBase64 = btoa(JSON.stringify(beforeBase64Dict))
        return `${url}?authorization=${afterBase64}`
    }

}
