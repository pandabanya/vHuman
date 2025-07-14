// AudioFramePacket.js

const MsgPacket = require('./MsgPacket');

class AudioFramePacket extends MsgPacket {
    static STATUS_LEN = 4;
    static FRAME_INDEX_LEN = 4;

    constructor() {
        super();
        this.vadStatus = 0;
        this.audioData = null;
    }

    // 将 VAD 状态和音频数据写入 audioData
    putData(vadStatus, data, length) {
        this.increaseSeqId();
        // 初始化或调整 audioData 的长度
        if (!this.audioData || this.audioData.length !== length + AudioFramePacket.STATUS_LEN) {
            this.audioData = Buffer.alloc(length + AudioFramePacket.STATUS_LEN);
        }
        this.audioData[0] = vadStatus;
        data.copy(this.audioData, 4, 0, length);
    }

    // 获取消息类型
    getMsgType() {
        return MsgPacket.AUDIO_FRAME_PACKET_TYPE;
    }

    // 获取音频内容
    getContent() {
        return this.audioData;
    }

    // 解码音频内容
    decodeContent(data) {
        this.audioData = data;
    }

    // 获取音频数据长度
    getAudioDataLen() {
        return this.audioData.length - AudioFramePacket.FRAME_INDEX_LEN - AudioFramePacket.STATUS_LEN;
    }

    // 获取音频帧数
    getAudioFrame() {
        return (this.audioData[AudioFramePacket.STATUS_LEN] & 0xff) |
               ((this.audioData[AudioFramePacket.STATUS_LEN + 1] << 8) & 0xff00) |
               ((this.audioData[AudioFramePacket.STATUS_LEN + 2] << 16) & 0xff0000) |
               ((this.audioData[AudioFramePacket.STATUS_LEN + 3] << 24) & 0xff000000);
    }

    // 从 audioData 读取音频数据到 data 缓冲区
    readAudioData(data, offset) {
        const audioDataLen = this.getAudioDataLen();
        if (data.length - offset < audioDataLen) {
            return -1;
        }
        this.audioData.copy(data, 0, AudioFramePacket.FRAME_INDEX_LEN + AudioFramePacket.STATUS_LEN, audioDataLen);
        return audioDataLen;
    }

    // 解析 VAD 状态
    parseVadStatus() {
        return this.audioData[0];
    }

    // 解析引擎索引
    parseEngineIndex() {
        return this.audioData[1];
    }
}

module.exports = AudioFramePacket;
