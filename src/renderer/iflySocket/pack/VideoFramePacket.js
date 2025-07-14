// VideoFramePacket.js

const MsgPacket = require('./MsgPacket');

class VideoFramePacket extends MsgPacket {
    constructor() {
        super();
        this.videoData = null; // 初始化 videoData 为 null
    }

    // 返回消息类型
    getMsgType() {
        return MsgPacket.VIDEO_FRAME_PACKET_TYPE;
    }

    // 获取内容，返回视频数据
    getContent() {
        return this.videoData;
    }

    // 解码内容，将解码后的数据存入 videoData
    decodeContent(data) {
        this.videoData = data;
    }
}

module.exports = VideoFramePacket;
