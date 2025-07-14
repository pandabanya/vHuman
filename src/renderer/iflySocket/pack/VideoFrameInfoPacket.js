// VideoFrameInfoPacket.js

const MsgPacket = require('./MsgPacket');

class VideoFrameInfoPacket extends MsgPacket {
    constructor(format, width, height) {
        super();
        if (format !== undefined && width !== undefined && height !== undefined) {
            // 创建包含格式、宽度和高度的 JSON 对象
            const jsonObject = {
                format: format,
                width: width,
                height: height
            };
            this.videoFrameInfo = JSON.stringify(jsonObject);
        } else {
            this.videoFrameInfo = "";
        }
    }

    // 返回消息类型
    getMsgType() {
        return MsgPacket.VIDEO_FRAME_INFO_PACKET_TYPE;
    }

    // 获取内容，将字符串转换为字节数组
    getContent() {
        return Buffer.from(this.videoFrameInfo, 'utf-8');
    }

    // 解码内容，将字节数组转换为字符串
    decodeContent(data) {
        this.videoFrameInfo = data.toString('utf-8');
    }
}

module.exports = VideoFrameInfoPacket;
