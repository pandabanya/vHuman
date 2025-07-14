// VideoSocketClient.js
const DataPacket = require('./pack/DataPacket')
const MsgPacket = require('./pack/MsgPacket')
const PacketUtil = require('./pack/PacketUtil')
const net = require('net');
const EventEmitter = require('events');

// FrameDetect 类
class FrameDetect {
    constructor() {
        this.hasFace = false;
        this.wakeUp = false;
        this.frameIndex = 0;
        this.faceInfo = new FaceInfo();
    }
}

// FaceInfo 类
class FaceInfo {
    constructor() {
        this.faceX = 0;
        this.faceY = 0;
        this.faceW = 0;
        this.faceH = 0;
        this.faceIndex = 0;
        this.mouthOcc = false;
        this.headYaw = 0.0;
        this.headPitch = 0.0;
    }
}


// VideoSocketClient 类，继承自 EventEmitter
class VideoSocketClient extends EventEmitter {

    constructor(ip, port) {
        super();
        this.ip = ip;
        this.port = port;
        this.client = null;
        this.waitLen = true;
        this.recvBuf = Buffer.alloc(7);
        this.recvIndex = 0;
        this.frameDetect = null;
        this.frameW = 0;
        this.frameH = 0;
        this.frameFormat = -1;
        this.mReceivePool = [];
        this.connected = false;
    }

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

    disConnect() {
        if (this.client && this.connected) {
            this.client.end()
            this.client = null
        }
    }

    // 接收数据
    recvData(buffer) {
        let size = buffer.length;
        let offset = 0;

        while (size > 0) {
            const writeLen = Math.min(this.recvBuf.length - this.recvIndex, size);
            buffer.copy(this.recvBuf, this.recvIndex, offset, offset + writeLen);
            this.recvIndex += writeLen;
            offset += writeLen;
            size -= writeLen;

            if (this.recvIndex === this.recvBuf.length) {
                if (this.waitLen) {
                    if (this.recvBuf[0] !== 0xA5 || this.recvBuf[1] !== 0x01) {
                        const a5Index = this.findIndex(0xA5, this.recvBuf, 1, this.recvIndex);
                        if (a5Index !== -1) {
                            let writeIndex = 0;
                            for(let readIndex = a5Index; readIndex < this.recvIndex; readIndex++, writeIndex++) {
                                this.recvBuf[writeIndex] = this.recvBuf[readIndex];
                            }
                            this.recvIndex -= a5Index;
                        } else {
                            this.recvIndex = 0;
                        }
                    } else {
                        const msgLen = ((this.recvBuf[6] & 0xff) << 24 |
                                        (this.recvBuf[5] & 0xff) << 16 |
                                        (this.recvBuf[4] & 0xff) << 8 |
                                        (this.recvBuf[3] & 0xff)) + 10;
                        const msgBuf = Buffer.alloc(msgLen);
                        this.recvBuf.copy(msgBuf);
                        this.recvBuf = msgBuf;
                        this.waitLen = false;
                    }
                } else {
                    this.onReceive(this.recvBuf);
                    this.recvIndex = 0;
                    this.recvBuf = Buffer.alloc(7);
                    this.waitLen = true;
                }
            }
        }
    }

    // 查找特定字节
    findIndex(target, data, offset, length) {
        for (let i = offset; i < length; i++) {
            if (data[i] === target) {
                return i;
            }
        }
        return -1;
    }

    // 数据包处理
    onReceive(data) {
        if (!this.isValid(data)) {
            console.warn("Invalid data, dropping it");
            return;
        }
        
        const dataPacket = this.decodePacket(data);
        if (dataPacket) {
            let msgPacket = dataPacket.data
            if (msgPacket.isReqType() && msgPacket.getMsgType() !== MsgPacket.HANDSHAKE_REQ_TYPE && this.mReceivePool.indexOf(msgPacket.getSeqID()) !== -1) {
                // console.log("recv same data, send ack drop it !!!");
                const ackPacket = PacketUtil.getAckMsg(msgPacket);
                this.sendAck(ackPacket);
                return;
            }
            if (msgPacket.isReqType()) {
                // console.log("recv msg id " + data[7] + "," + data[8]);
                this.addReceivePool(msgPacket.getSeqID());
                this.processReqPacket(msgPacket);
            }

        }
    }

    // 数据包解析（根据实际需求解码数据包）
    decodePacket(data) {
        // 返回解码后的数据包对象
        let dataPacket = null
        try {
            dataPacket = new DataPacket()
            dataPacket.decodeBytes(data)
        } catch (e) {
            console.error('decodePacket error: ', e)
        }
        return dataPacket
    }

    async processReqPacket(packet) {
        // console.log("msg id", packet.getSeqID());

        const ackPacket = PacketUtil.getAckMsg(packet);
        this.sendAck(ackPacket);

        switch (packet.getMsgType()) {
            case MsgPacket.FACE_INFO_PACKET_TYPE: {
                this.processFaceInfo(packet)
                break;
            }
            case MsgPacket.VIDEO_FRAME_INFO_PACKET_TYPE: {
                this.processVideoFrameInfo(packet)
                break;
            }
            case MsgPacket.VIDEO_FRAME_PACKET_TYPE: {
                this.processVideoFramePacket(packet)
               break;
            }
            case MsgPacket.FACE_INFO_LIST_PACKET_TYPE: {
                this.processFaceList(packet)
                break;
            }
            default:
                console.warn("Unknown packet type:", packet.getMsgType());
                break;
        }
    }

    // 处理单人版人脸检测
    processFaceInfo(packet) {
        const faceInfoPacket = packet;
        if (!this.frameDetect) {
            this.frameDetect = [new FrameDetect()];
        }
        try {
            const jsonObject = JSON.parse(faceInfoPacket.faceInfo);
            this.parseFaceInfo(jsonObject, this.frameDetect[0]);
        } catch (error) {
            console.error(error);
        }
    }

    // 处理图像帧格式
    processVideoFrameInfo(dataPacket) {
        const frameInfoPacket = dataPacket;
        try {
            const jsonObject = JSON.parse(frameInfoPacket.videoFrameInfo);
            this.frameFormat = jsonObject.format;
            this.frameW = jsonObject.width;
            this.frameH = jsonObject.height;
        } catch (error) {
            console.error(error);
        }
    }

    // 处理视频帧数据
    processVideoFramePacket(dataPacket) {
        if (this.frameFormat === -1 || this.frameH === 0 || this.frameW === 0) {
            return;
        }
        this.emit('onFrameData', dataPacket.videoData, this.frameFormat, this.frameW, this.frameH, this.frameDetect)
    }

    // 解析人脸信息
    parseFaceInfo(jsonObject, frameDetect) {
        frameDetect.hasFace = jsonObject.hasFace;
        frameDetect.frameIndex = jsonObject.frameIndex;
        frameDetect.wakeUp = jsonObject.wakeUp;
        
        if (frameDetect.hasFace) {
            frameDetect.faceInfo = new FaceInfo();
            frameDetect.faceInfo.faceX = jsonObject.faceInfo.x;
            frameDetect.faceInfo.faceY = jsonObject.faceInfo.y;
            frameDetect.faceInfo.faceW = jsonObject.faceInfo.w;
            frameDetect.faceInfo.faceH = jsonObject.faceInfo.h;
            frameDetect.faceInfo.faceIndex = jsonObject.faceInfo.faceIndex;
            frameDetect.faceInfo.headPitch = jsonObject.faceInfo.headPitch;
            frameDetect.faceInfo.headYaw = jsonObject.faceInfo.headYaw;
            frameDetect.faceInfo.mouthOcc = jsonObject.faceInfo.mouthOcc;
        } else {
            frameDetect.faceInfo = null;
        }
    }

    // 处理多人版人脸检测数据
    processFaceList(packet) {
        const faceInfoPacket = packet;
        try {
            const jsonObject = JSON.parse(faceInfoPacket.faceInfo);
            const faceList = jsonObject.list || [];
            if (!this.frameDetect || this.frameDetect.length !== faceList.length) {
                this.frameDetect = Array.from({ length: faceList.length }, () => new FrameDetect());
            }
            faceList.forEach((faceData, index) => {
                this.parseFaceInfo(faceData, this.frameDetect[index]);
            });
        } catch (error) {
            console.error(error);
        }
    }

    // 将确认包发送到服务器
    sendAck(dataPacket) {
        if (this.client) {
            // console.log('sendACK', dataPacket)
            let jsonString = JSON.stringify(dataPacket)
            this.client.write(jsonString, 'utf-8', (err) => {
                if (err) {
                    console.log(`socket 写入出错：`, err)
                } else {
                    // console.log('socket 写入成功')
                }
            });
        }
    }

    // 判断数据包是否合法
    isValid(data) {
        // 需要实现数据包的验证逻辑
        return DataPacket.CHECK_CODE === data[data.length - 1];
    }

    addReceivePool(seqID) {
        if (this.mReceivePool.length > 200) {
            this.mReceivePool = [];
        }
        this.mReceivePool.push(seqID);
    }
}

module.exports = VideoSocketClient;
