const pako = require('pako')
const { SerialPort } = require('serialport')
const { ipcRenderer } = require('electron')
const PacketWapper = require('../renderer/iflySocket/serialport/PacketWapper')

const serialOptions = { // 串口配置选项
    baudRate: 115200, // 波特率
    dataBits: 8, // 数据位
    stopBits: 1, // 停止位
    parity: 'none', // 校验位
    bufferSize: 1024, // 缓冲区大小
    flowControl: 'none', // 流控制
};

let deviceName = '' // 设备名称
let serialPort = null; // 串口实例
let dataList = []; // 数据缓存列表
let serailDataLength = 0; // 串口数据长度
let isConnected = false; // 连接状态标志
let seqId = 0; // 消息序列ID
let msg = "" // 消息内容
let seqIdQueue = [] // 序列ID队列，用于去重
let pgsStack = [] // 语音识别结果堆栈

let canInteractive = false   // 交互模式
let vadPauseTimer = null; // 语音暂停检测定时器

// 消息过滤 key: sid  value: [不同sid的消息]
let cbmTidyMap = new Map() // 用于存储和过滤消息的映射表

process.on('uncaughtException', (err) => {
    console.error('serial worker进程发生错误', err)
})

process.on('unhandledRejection', (reason, promise) => {
    console.error('reason', reason)
    console.error('promise', promise)
})

// 获取设备上的串口
const requestSerial = async () => {
    try {
        await SerialPort.list().then((ports) => {// 获取串口列表
            console.log('ports', ports);
            if (ports) { // 如果存在串口
                deviceName = process.env.VUE_APP_DEVICE_NAME // 从环境变量获取设备名称  COM3
            }
        })

        if (!deviceName) {
            printAIUIMsg('无法找到串口设备')
            return;
        }

        // 串口配置
        let SerialOptions = {
            path: deviceName,
            baudRate: serialOptions.baudRate,
            dataBits: serialOptions.dataBits,
            stopBits: serialOptions.stopBits,
            parity: serialOptions.parity.toLowerCase(),
            bufferSize: serialOptions.bufferSize,
            flowControl: serialOptions.flowControl.toLowerCase(),
        };
        // 创建串口实例
        serialPort = new SerialPort(SerialOptions, (err) => {
            if (err) {
                console.error('串口打开失败:', err);
            } else {
                printAIUIMsg('串口已成功打开')
            }
        })

        serialPort.on('data', (data) => { // 监听串口数据事件
            // console.log('接收到数据', data);
            onReceiveData(data) // 处理接收到的处理
        })

        serialPort.on('error', (e) => {
            console.log('串口错误', e);
        })

        serialPort.on('close', () => {
            printAIUIMsg('串口关闭')
        })
    } catch (e) {
        console.error('串口初始化失败:', e);
    }
};

//------------------------------------------------------------------------------

const onReceiveData = (data) => {
    if (data) {
        handleData(data)
    }
}

const handleData = (data) => { // 处理数据函数
    for (let i = 0; i < data.length; i++) {
        dataList.push(data[i]); // 将字节添加到数据列表
        if (dataList.length === 5) {
            if (dataList[0] === PacketWapper.SYNC_HEAD && dataList[1] === PacketWapper.USER_ID) // 检查包头
            {
                serailDataLength = ( ( dataList[4] & 0xff ) << 8 ) + ( dataList[3] & 0xff ); // 计算数据长度
            } else {
                // 如果不是有效的包头
                dataList.splice(0, 1);  // 移除第一个字节
            }
        }
        // 如果数据长度匹配
        if (serailDataLength !== 0 && dataList.length !== 0 && ( dataList.length === ( 8 + serailDataLength ) )) {
            if (dataList[0] === PacketWapper.SYNC_HEAD && dataList[1] === PacketWapper.USER_ID) { // 再次验证包头
                if (dataList[dataList.length - 1] === PacketWapper.CalcCheckCode(dataList)) {
                    seqId = ( ( data[6] & 0xff ) << 8 ) + ( data[5] & 0xff ); // 计算序列ID
                    const msgType = dataList[2] // 获取消息类型
                    console.log(`消息id ${seqId}, 消息类型：${msgType}`)

                    if (msgType !== PacketWapper.CONFIRM_MESSAGE_TYPE) { // 如果不是确认消息
                        const message = PacketWapper.buildConfirmPacket(seqId);
                        if (message) { // 如果确认包存在
                            writeData(message); // 发送确认包
                        }

                        if (msgType === PacketWapper.SHAKE_HAND_TYPE) { // 如果是握手消息 说明连上了
                            // 握手
                            isConnected = true;
                            // 清空发送池、接收池   
                            seqIdQueue = []
                        }
                        dealMsg(dataList, serailDataLength);
                    }
                }
            }
            dataList = []; // 清空数据列表
            serailDataLength = 0; // 重置数据长度
        }
    }
};

const dealMsg = (list, contentLen) => { // 消息处理函数
    const msgType = list[2] // 获取消息类型
    const msgExist = seqIdExist(seqId) // 检查序列ID是否已存在
    if (msgType !== PacketWapper.CONFIRM_MESSAGE_TYPE && msgType !== PacketWapper.SHAKE_HAND_TYPE && msgExist ) { // 如果消息已存在且不是确认或握手消息
        console.log(`消息重复，丢弃`)
        return
    }
    addSeqIdToQueue(seqId) // 将序列ID添加到队列
    if (msgType === PacketWapper.AIUI_MESSAGE_TYPE) { 
        // AIUI消息
        let data = new Uint8Array(contentLen);
        for (let j = 0; j < contentLen; j++) {
            data[j] = list[j + 7];
        }
        let str = pako.inflate(data, { to: 'string' });
        console.log(`recv msg`, str);
        if (str) {
            const strObj = JSON.parse(str)
            const type = strObj.type
            const content = strObj.content
            switch(type) {
                case 'wifi_status':
                    const wifi_connected = content.connected
                    printAIUIMsg(`3588网络状态： ${wifi_connected}`)
                    break;
                case 'speech_device_status':
                    // 多模态麦克风和摄像头状态
                    printAIUIMsg(`3588 IP： ${content.local_ip}`)
                    sendMsgToRenderer({type: 'ip', data: content.local_ip})
                    break;
                case 'aiui_event':
                    // AIUI结果事件
                    dealWithEvent(content);
                    break;
                case 'tts_event':
                    // 合成
                    // {
                    //  "type": "tts_event",
                    //  "content": {
                    //      "eventType": 1,        //合成结束事件
                    //      "error": ttsErrorCode  //0表示成功;发生错误时代表合成错误码
                    //  }
                    // }
                    printAIUIMsg(`3588 tts eventType: ${content.eventType}`)
                    break;
            }
        }
    }
}

// 处理AIUI结果事件
const dealWithEvent = (content) => {
    if (!content) {
        return
    }
    // "content": {
    //     "eventType":1,  //事件类型
    //     "arg1":0,       //参数1
    //     "arg2":0,       //参数2
    //     "info":{},      //描述信息
    //     "result":{}     //结果
    // }
    let eventObj = content
    console.log('eventObj', eventObj)
    let event_type = eventObj.eventType
    if (event_type === 1) {
        // if (!canInteractive) {
        //     return
        // }

        // 结果事件,
        // info 字段格式：
        // {
        //     "data": [{
        //         "params": {
        //             "sub": "iat",
        //         },
        //         "content": [{
        //             "dte": "utf8",
        //             "dtf": "json",
        //             "cnt_id": "0"
        //         }]
        //     }]
        // }
        let info_data = eventObj.info.data[0]
        // console.log('info_data', info_data)
        let sub = info_data.params.sub
        if (sub === 'iat') { // 如果是语音识别
            iatParser(eventObj) // 解析语音识别结果
        } else if (sub === 'nlp') {
           // nlpParser(eventObj)
        } else if (sub === 'tts') { // 如果是语音合成
            ttsParser(eventObj) // 解析tts结果
        } else if (sub === 'cbm_tidy') {
            // 大模型的语义规整
            cbmTidyParser(eventObj)
        }
    } else if (event_type === 2) {
        // 出错事件
        printAIUIMsg(`出错了，错误码：${eventObj.arg1}, 描述：${eventObj.info}`)
        sendMsgToRenderer({type: 'error', data: eventObj.info})
    } else if (event_type === 4) {
        // 唤醒事件
        printAIUIMsg(`3588已被唤醒`)
        sendMsgToRenderer({type: 'awake', data: ""})
        canInteractive = true
        resetIATParam()
    } else if (event_type === 5) {
        // 休眠事件
        printAIUIMsg(`3588进入休眠`)
        sendMsgToRenderer({type: 'sleep', data: ""})
        canInteractive = false
        resetIATParam()
    } else if (event_type === 6) {
         // 模型生成
            const arg1 = eventObj.arg1
            // 休眠事件
            printAIUIMsg(`3588 VAD 事件, arg1: ${arg1}`)
            if (arg1 === 2 || arg1 === 3) {
                sendMsgToRenderer({type: 'vad_finish', data: msg})
                resetIATParam()
                canInteractive = false
            } else if (arg1 === 0) {
                sendMsgToRenderer({type: 'vad_start', data: null})
                // 添加语音暂停检测定时器
                if (vadPauseTimer) clearTimeout(vadPauseTimer);
                vadPauseTimer = setTimeout(() => {
                    if (canInteractive && msg.length > 0) {
                        sendMsgToRenderer({type: 'vad_pause', data: msg});
                    }
                }, 3000); // 3秒无输入视为暂停
            }
        } else if (event_type === 15) {
        // 语音合成事件

    }
}

const resetIATParam = () => {
    msg = ""
    pgsStack = []
}

const iatParser = (eventObj) => {
    // {
    //     "text": {
    //         "bg": 0,
    //         "sn": 1,
    //         "ws":[
    //             {"bg": 0,"cw": [{"w": "叫","sc": 0}]},
    //             {"bg": 0,"cw": [{"w": "什么","sc": 0}]},
    //             {"bg": 0,"cw": [{"w": "名字","sc": 0}]}
    //         ],
    //         "ls": false,
    //         "ed": 0
    //     }
    // }

    let info_data = eventObj.info.data[0]
    let contentObj = info_data.content[0]
    if ('cnt_id' in contentObj) {
        const cnt_id = contentObj.cnt_id
        const textObj = eventObj.result.text
        const wsList = textObj.ws
        let curMsg = ""
        if (wsList && wsList.length > 0) {
            wsList.forEach(ws => {
                curMsg += ws.cw[0].w
            })
        }
        pgsStack[textObj.sn] = curMsg
        console.log(`sn: ${textObj.sn}  curMsg: ${curMsg} lastIndex: ${pgsStack.length - 1}`)
        if (textObj.sn < (pgsStack.length - 1)) {
            return
        }
        // apd（追加结果），rpl（替换结果）
        if ('pgs' in textObj) {
            if (textObj.pgs === 'rpl') {
                // 替换
                const range = textObj.rg
                if (range && range.length === 2) {
                    //根据replace指定的range，清空stack中对应位置值
                    const start = range[0]
                    const end = range[1]
                    for (let i = start; i <= end; i++) {
                        pgsStack[i] = null
                    }

                    let pgsResult = ""
                    for (let index = 0; index < pgsStack.length; index++) {
                        if (null == pgsStack[index] || pgsStack[index] === '') {
                            continue
                        }
                        if (pgsResult.length > 0) {
                            pgsResult += '\n'
                        }
                        pgsResult += pgsStack[index]
                    }
                    msg = pgsResult
                } else {
                    console.error(`语音识别结果替换范围出错`)
                    msg = curMsg
                }
            } else {
                // 追加
                msg += curMsg
            }
        } else {
            msg = curMsg
        }
        printAIUIMsg(`AIUI语音识别结果: ${msg}  是否结束：${textObj.ls}`)
        sendMsgToRenderer({type: 'asr', data: msg, isLast: textObj.ls})
        if (textObj.ls) {
            resetIATParam()
        }
    }
}

const nlpParser = (eventObj) => {
    let repair_text = eventObj.result.intent.text
    printAIUIMsg(`AIUI服务器纠正后的问题: ${repair_text}`)
    sendMsgToRenderer({type: 'nlp', data: repair_text, isLast: true})
}

const ttsParser = (eventObj) => {
    let info_data = eventObj.info.data[0]
    if (info_data.content.cnt_id) {
        const sid = info_data.sid
        // 通过cnt_id获取音频数据
        let audioData = null
        let dts = Number.parseInt(info_data.content.dts)
        let frameId = Number.parseInt(info_data.content.frameId)
        let percent = Number.parseInt(info_data.percent)
        let isCancel = "1" === info_data.content.cancel

        if (audioData && audioData.length > 0) {
            // 使用播放器播放
        }
    }
}

const cbmTidyParser = (eventObj) => {
    let info_data = eventObj.info.data[0]
    let contentObj = info_data.content[0]
    if ('cnt_id' in contentObj) {
        let resultObj = eventObj.result
        if ('cbm_tidy' in resultObj) {
            const seq = resultObj.cbm_tidy.seq
            const sid = resultObj.sid
            const exist = seqExistInSidMap(sid, seq)
            console.log(`seq: ${seq} 已经存在 sid ${sid} map ? ${exist}`)
            if (exist) {
                return
            }
            addSidToMap(sid, seq)
            let textObj = JSON.parse(resultObj.cbm_tidy.text)
            if (textObj && 'query' in textObj) {
                msg = textObj.query
                printAIUIMsg(`AIUI 大模型语义规则结果: ${msg}`)
                sendMsgToRenderer({type: 'cbm_tidy', data: msg, isLast: true})
                msg = ""
            }
        }
    }
}

const seqExistInSidMap = (sid, seq) => {
    if (cbmTidyMap.size > 200) {
        cbmTidyMap = new Map()
    }
    let valueList = cbmTidyMap.get(sid)
    if (valueList) {
        const index = valueList.indexOf(seq)
        return index !== -1
    }
    return false
}

const addSidToMap = (sid, seq) => {
    let valueList = cbmTidyMap.get(sid)
    if (!valueList) {
        valueList = []
        cbmTidyMap.set(sid, valueList)
    }
    valueList.push(seq)
}

//--------------------- 发送信息 start ------------------------------------

export const sendCMDMsgToAIUI = (type) => {
    console.log(`sendCMDMsgToAIUI type: ${type}`)
    let cmdMsg = []
    if (type === 'wakeup') {
        cmdMsg = PacketWapper.wakeupMsg()
    } else if (type === 'reset_wakeup') {
        cmdMsg = PacketWapper.resetWakeupMsg()
    }
    writeData(cmdMsg)
}

const writeData = (data) => {
    // console.log('start write serial data: ', data)
    serialPort.write(data, (e) => {
        if (e) {
            console.log('串口写数据异常', e)
        } else {
            console.log('数据已送达')
        }
    })
}
//--------------------- 发送信息 end------------------------------------

const addSeqIdToQueue = (seqId) => {
    if (seqIdQueue.length > 200) {
        seqIdQueue = []
    }
    seqIdQueue.push(seqId)
}

const seqIdExist = (seqId) => {
    return !Number.isNaN(seqId) && seqIdQueue.indexOf(seqId) !== -1
}

const sendMsgToRenderer = (msg) => {
    ipcRenderer.send('window-message-from-worker', msg)
    // parentPort.postMessage(msg)
}

const printAIUIMsg = (msg) => {
    console.log(
        "%c[ance serial port worker]%c " + msg,
        "color:#fff;background:#008000;",
        "color:#000;"
    );
}
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

