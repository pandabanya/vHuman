// AudioSocketClient.js
const net = require('net');
const PacketUtil = require('./pack/PacketUtil');
const AudioFramePacket = require('./pack/AudioFramePacket');
const DataPacket = require('./pack/DataPacket');

class AudioSocketClient {
    constructor(ip, port, listener) {
        this.ip = ip;
        this.port = port;
        this.listener = listener;
        this.waitLen = true;
        this.recvBuf = Buffer.alloc(7);
        this.recvIndex = 0;
        this.mReceivePool = [];
        this.tmpAudioData = null;
        this.client = null;
    }

    // 启动连接
    start() {
        this.client = net.createConnection({ host: this.ip, port: this.port }, () => {
            console.log('Connected to server');
            if (this.listener && this.listener.onConnectSuccess) {
                this.listener.onConnectSuccess();
            }
        });

        this.client.on('data', (data) => {
            this.recvData(data);
        });

        this.client.on('end', () => {
            console.log('Disconnected from server');
            if (this.listener && this.listener.onDisConnect) {
                this.listener.onDisConnect();
            }
        });

        this.client.on('error', (err) => {
            console.error('Socket error:', err);
            this.client.end();
        });
    }

    // 处理接收到的数据
    recvData(buffer) {
        let offset = 0;
        let size = buffer.length;

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
                            console.warn('recv data contain SYNC HEAD, shift buffer before', this.recvBuf);
                            this.recvBuf.copy(this.recvBuf, 0, a5Index);
                            this.recvIndex -= a5Index;
                        } else {
                            console.warn('recv data do not contain SYNC HEAD, drop', this.recvBuf);
                            this.recvIndex = 0;
                        }
                    } else {
                        const msgLen = ((this.recvBuf[6] & 0xff) << 24 | (this.recvBuf[5] & 0xff) << 16 | (this.recvBuf[4] & 0xff) << 8 | (this.recvBuf[3] & 0xff)) + 10;
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

    // 查找字节的索引
    findIndex(target, data, offset, length) {
        for (let i = offset; i < length; i++) {
            if (data[i] === target) return i;
        }
        return -1;
    }

    // 处理接收到的完整消息包
    onReceive(data) {
        if (!DataPacket.isValid(data)) {
            console.warn('recv data is not valid, drop it !!!');
            return;
        }

        const dataPacket = new DataPacket();
        try {
            dataPacket.decodeBytes(data);
        } catch (e) {
            console.error('recv packet decode error', e.message);
            return;
        }

        const msgPacket = dataPacket.data;
        if (msgPacket.isReqType() && msgPacket.getMsgType() !== MsgPacket.HANDSHAKE_REQ_TYPE && this.mReceivePool.includes(msgPacket.getSeqID())) {
            console.error('recv same data, send ack drop it !!!');
            const ackPacket = PacketUtil.getAckMsg(msgPacket);
            return;
        }

        if (msgPacket.isReqType()) {
            console.info('recv msg id', data[7], data[8]);
            this.addReceivePool(msgPacket.getSeqID());
            this.processReqPacket(msgPacket);
        }
    }

    addReceivePool(seqID) {
        if (this.mReceivePool.length > 200) {
            this.mReceivePool.shift();
        }
        this.mReceivePool.push(seqID);
    }

    // 处理请求包
    processReqPacket(packet) {
        if (packet.getMsgType() === MsgPacket.AUDIO_FRAME_PACKET_TYPE) {
            const audioFramePacket = packet;
            const audioLen = audioFramePacket.getAudioDataLen();

            if (!this.tmpAudioData || this.tmpAudioData.length !== audioLen) {
                this.tmpAudioData = Buffer.alloc(audioLen);
            }

            audioFramePacket.readAudioData(this.tmpAudioData, 0);
            console.info('engine index', audioFramePacket.parseEngineIndex(), 'msg id', packet.getSeqID(), 'vad', audioFramePacket.parseVadStatus(), 'index', audioFramePacket.getAudioFrame());

            if (this.listener && this.listener.onAudioData) {
                this.listener.onAudioData(audioFramePacket.parseEngineIndex(), this.tmpAudioData, audioLen, audioFramePacket.parseVadStatus());
            }
        }
    }
}

module.exports = AudioSocketClient;
