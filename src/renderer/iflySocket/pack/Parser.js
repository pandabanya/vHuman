const VideoFramePacket = require("./VideoFramePacket");
const HandShakePacket = require("./HandShakePacket");
const VideoFrameInfoPacket = require("./VideoFrameInfoPacket");
const FaceInfoPacket = require("./FaceInfoPacket");
const FaceListPacket = require("./FaceListPacket");
const AudioFramePacket = require("./AudioFramePacket");
const ACKPacket = require("./ACKPacket");

class Parser {
    /**
     * 解析原始数据包，根据数据包类型构建相应的 MsgPacket 实例
     * @param {Buffer} rawData - 原始数据包
     * @returns {MsgPacket | null} 返回解析后的消息包
     */
    static parse(rawData) {
        const packetType = rawData[0];

        switch (packetType) {
            case VideoFramePacket.VIDEO_FRAME_PACKET_TYPE:
                return new VideoFramePacket().decodeBytes(rawData);
            case HandShakePacket.HANDSHAKE_REQ_TYPE:
                return new HandShakePacket().decodeBytes(rawData);
            case VideoFrameInfoPacket.VIDEO_FRAME_INFO_PACKET_TYPE:
                return new VideoFrameInfoPacket().decodeBytes(rawData);
            case FaceInfoPacket.FACE_INFO_PACKET_TYPE:
                return new FaceInfoPacket().decodeBytes(rawData);
            case FaceListPacket.FACE_INFO_LIST_PACKET_TYPE:
                return new FaceListPacket().decodeBytes(rawData);
            case AudioFramePacket.AUDIO_FRAME_PACKET_TYPE:
                return new AudioFramePacket().decodeBytes(rawData);
            case ACKPacket.ACK_TYPE:
                return new ACKPacket().decodeBytes(rawData);
            default:
                return null;
        }
    }
}

module.exports = Parser