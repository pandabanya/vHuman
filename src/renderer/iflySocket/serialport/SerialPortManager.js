const {SerialPort} = require("serialport");
const EventEmitter = require("events");
const SerialDataPacket = require("./SerialDataPacket");
const PacketEntity = require("./PacketEntity");
const Error = require("../Error");


class SerialPortManager extends EventEmitter {

    serialOptions = {
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        bufferSize: 1024,
        flowControl: 'none',
    };

    isConnected = false;
    deviceName = ''
    serialPort = null;
    recListener = null
    sendListener = null

    SEND_RETRY_COUNT = 3
    SEND_TIME_OUT = 300
    sendPool = []

    constructor(recMsgListener, sendMsgListener) {
        super()
        if (!SerialPortManager.instance) {
            SerialPortManager.instance = this;
            this.recListener = recMsgListener
            this.sendListener = sendMsgListener
        }
        return SerialPortManager.instance;
    }

    async requestSerial() {
        try {
            await SerialPort.list().then((ports) => {
                console.log('ports', ports);
                if (ports) {
                    this.deviceName = ports[0].path
                }
            })

            if (!this.deviceName) {
                console.log('无法找到串口设备')
                return;
            }
            let SerialOptions = {...this.serialOptions, path: this.deviceName}
            this.serialPort = new SerialPort(SerialOptions, (err) => {
                if (err) {
                    console.error('串口打开失败:', err);
                } else {
                    this.isConnected = true
                    console.log('串口已成功打开')
                }
            })

            this.serialPort.on('data', (data) => {
                console.log('串口接收到数据', data);
                this.emit({action:'receive', data: data})
            })

            this.serialPort.on('error', (e) => {
                console.log('串口错误', e);
            })

            this.serialPort.on('close', () => {
                console.log('串口关闭')
            })
        } catch (e) {
            console.error('串口初始化失败:', e);
        }
    }

    // 向串口发送数据，content是json字符串
    sendMsgToSerialPort(content) {
        const dataPacket = new SerialDataPacket(content)
        this.sendRequest(dataPacket, this.listener)
    }

    listener(dataPacket) {
        return {
            onSuccess() {
                // console.log(dataPacket.)
                this.emit({type: 'send_status', data: 'success'})
            },
            onFailed(err) {

            }
        }
    }

    sendRequest(packet, listener) {
        const entity = new PacketEntity(packet, listener)
        this.addToSendPool(entity)
        this.processSendPool()
    }

    addToSendPool(packetEntity)  {
        this.sendPool.push(packetEntity)
    }

    processSendPool(){
        let minSleepTime = this.SEND_TIME_OUT
        let currentTime = Date.now()
        while(this.sendPool.length > 0) {
            const entity = this.sendPool.slice(0, 1)
            if (entity.isHasAcked) {
                entity.onSuccess(entity)
                this.sendPool.splice(0, 1)
                continue
            }
            if (entity.retryCount >= this.SEND_RETRY_COUNT) {
                entity.onFailed(Error.NO_ACK)
                this.sendPool.splice(0, 1)
                continue
            }
            //未收到确认重试次数也未超过的消息
            if (currentTime - entity.lastSendTime >= this.SEND_TIME_OUT) {
                this.sendPacket(entity.dataPacket)
                if (entity.isNeedAck) {
                    entity.increaseRetryCount()
                    entity.lastSendTime = currentTime
                } else {
                    this.sendPool.splice(0, 1)
                }
            } else {
                let sendInterval = this.SEND_TIME_OUT - (currentTime - entity.lastSendTime);
                if(sendInterval < minSleepTime){
                    minSleepTime = sendInterval;
                }
            }
        }
        try {
            // sendPool.wait(minSleepTime);
        } catch (e) {
            //ignore
        }
    }

    sendPacket(packet){
        let retryCount = 0;
        do {
            console.log("send packet start");
            try {
                // 编码数据
                const encodeBytes = packet.encodeBytes();
                // 打印发送数据的十六进制表示
                if (encodeBytes.length < 300) {
                    console.log("send hex : " + this.byteToHex(encodeBytes, encodeBytes.byteLength));
                }
                // 通过串口发送数据
                this.serialPort.write(encodeBytes, (e) => {
                    if (e) {
                        console.log('串口写数据异常', e)
                    } else {
                        console.log('数据已送达')
                        break
                    }
                })
            } catch (error) {
                console.error("send packet encode error: " + error.message);
                break;
            }
        } while (retryCount++ < 3);
    }

    /**
     * 将字节数组转换为十六进制字符串
     * @param {Uint8Array} bytes - 字节数组
     * @param {number} cnt - 转换的字节数
     **/
    byteToHex(bytes, cnt) {
        let strHex = "";
        const sb = [];
        for (let n = 0; n < cnt; n++) {
            strHex = bytes[n].toString(16).padStart(2, '0'); // 转换为两位十六进制
            sb.push(strHex);
        }
        return sb.join(' ').trim(); // 用空格拼接，并去掉前后空格
    }

}