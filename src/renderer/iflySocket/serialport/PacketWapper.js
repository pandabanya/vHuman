const SerialMsgPacket = require('./SerialMsgPacket')
const pako = require("pako");
const SerialDataPacket = require('./SerialDataPacket')

class PacketWapper {
    static SYNC_HEAD = 0xA5;
    static USER_ID = 0x01;
    static SHAKE_HAND_TYPE = 0x01;
    static WIFI_CONFIG_TYPE = 0x02;
    static AIUI_CONFIG_TYPE = 0x03;
    static AIUI_MESSAGE_TYPE = 0x04;
    static CONTROL_MESSAGE_TYPE = 0x05;
    static STATIC_IP_TYPE = 0x06;
    static CUSTOM_DATA_TYPE = 0x2A;
    static CONFIRM_MESSAGE_TYPE = 0xff;
    static QUERY_DEVICE_STATE = '{"type": "status","content": {"query": "speech_device"}}';

    static TTSMsgAnother(action, text) {
        // 转为二进制数据
        let ttsData = text.getBytes("utf-8");
        let params = "vcn=x2_xiaojuan,speed=50,pitch=50,volume=50"
        return PacketWapper.CMDPacket(27, action, 0, params, ttsData)
    }

    /**
     * msgType: 消息类型
     * arg1:
     * arg2: 消息类型
     * params: 其他参数
     * data: 非必须，值为文本数据的二进制数据的base64编码，即 byte[]
     */
    static CMDPacket(msgType, arg1, arg2, params, data) {
        let contentDict = {
            msg_type: msgType,
            arg1: arg1,
            arg2: arg2,
            params: params=null ? '':params
        }
        if (data && data.length > 0) {
            contentDict['data'] = Base64.encode(data)
        }

        return {
            type: 'aiui_msg',
            content: contentDict
        }
    }

    static TTSMsg(action, text) {
        // {
        //     "type": "tts",
        //     "content": {
        //         "action": "start",  //开始合成
        //             "text": "xxx",       //需要合成播放的文本(注意文本的编码格式要为utf-8)
        //             "parameters" : {
        //             "emot" : "xxx", //emot值为neutral，happy，sorrow中一个
        //                 "xxx" : "xxx" // TTS支持设置的其他参数
        //         }
        //     }
        // }

        // let ttsData = PacketWapper.stringToUintArray(text)

        let ttsParamsObj = {
            type: 'tts'
        }
        if (action === 'start') {
            ttsParamsObj['content'] = {
                action: action,
                text: text,
                parameters: {
                    emot: 'neutral',
                    vcn: 'x2_xiaoyan',
                    speed: 50,
                    pitch: 50,
                    volume: 50
                }
            }
        } else {
            ttsParamsObj['content'] = {
                action: action
            }
        }
        let content = JSON.stringify(ttsParamsObj)
        let contentData = this.stringToUintArray(content)
        return new SerialMsgPacket(SerialMsgPacket.CTR_PACKET_TYPE, contentData)
    }

    static buildConfirmPacket (seqId)  {
        if (Number.isNaN(seqId)) {
            return null
        }
        const confirmMessage = new Uint8Array(12);
        confirmMessage[0] = PacketWapper.SYNC_HEAD;
        confirmMessage[1] = PacketWapper.USER_ID;
        confirmMessage[2] = PacketWapper.CONFIRM_MESSAGE_TYPE;
        confirmMessage[3] = 0x04;
        confirmMessage[4] = 0x00;
        confirmMessage[5] = ( seqId & 0xff );
        confirmMessage[6] = ( seqId >> 8 & 0xff );
        confirmMessage[7] = 0xA5;
        confirmMessage[8] = 0x00;
        confirmMessage[9] = 0x00;
        confirmMessage[10] = 0x00;
        confirmMessage[11] = PacketWapper.CalcCheckCode(confirmMessage);
        return confirmMessage;
    }

    static buildShakePacket (seqId) {
        if (Number.isNaN(seqId)) {
            return null
        }
        seqId++;
        const confirmMessage = new Uint8Array(12);
        confirmMessage[0] = PacketWapper.SYNC_HEAD;
        confirmMessage[1] = PacketWapper.USER_ID;
        confirmMessage[2] = PacketWapper.SHAKE_HAND_TYPE;
        confirmMessage[3] = 0x04;
        confirmMessage[4] = 0x00;
        confirmMessage[5] = ( seqId & 0xff );
        confirmMessage[6] = ( seqId >> 8 & 0xff );
        confirmMessage[7] = 0xA5;
        confirmMessage[8] = 0x00;
        confirmMessage[9] = 0x00;
        confirmMessage[10] = 0x00;
        confirmMessage[11] = PacketWapper.CalcCheckCode(confirmMessage);
        return confirmMessage;
    };

    static staticIPMsg() {
        const msg = {
            "staticIp": true,            //设置为静态IP
            "address": "10.40.148.170",    //ip配置
            "mask": "255.255.255.0",    //子网掩码配置
            "gateway": "10.40.148.254",    //网关配置
            "dns": "114.114.114.114"        //DNS配置
        }
        const ethPacket = new SerialMsgPacket(SerialMsgPacket.ETH_CONF_TYPE, PacketWapper.stringToUintArray(msg))
        const ethDataPacket = new SerialDataPacket(ethPacket)
        return ethDataPacket.encodeBytes()
    }

    static wakeupMsg() {
        return this.cmdPacket(7)
    }

    static resetWakeupMsg() {
        return this.cmdPacket(8)
    }

    static cmdPacket(msgType, content="") {
        const msg = {
            "type": "aiui_msg",
            "content": {
                "msg_type": msgType, //CMD_RESET_WAKEUP  重置AIUI唤醒状态
                "arg1": 0,
                "arg2": 0,
                "params": "",
                "data": "" //非必须，值为原数据的base64编码
            }
        }
        const ethPacket = new SerialMsgPacket(SerialMsgPacket.CTR_PACKET_TYPE, PacketWapper.stringToUintArray(msg))
        const ethDataPacket = new SerialDataPacket(ethPacket)
        return ethDataPacket.encodeBytes()
    }

    static stringToUintArray(text) {
        // 创建一个 TextEncoder 实例
        const encoder = new TextEncoder();

        // 将字符串转换为 UTF-8 编码的 Uint8Array
        return encoder.encode(text);
    }

    static CalcCheckCode(d) {
        let checkCode = 0;
        for (let i = 0; i < d.length - 1; i++) {
            checkCode += d[i];
        }
        checkCode = ( ~(checkCode & 0xff) + 1 ) & 0xFF;
        return checkCode;
    }

    static unzip(binData) {
        // Convert binary string to character-number array
        // // unzip
        const data = pako.inflate(binData);
        console.log('sss', data);
        // Convert gunzipped byteArray back to ascii string:
        return String.fromCharCode.apply(null, new Uint16Array(data));
    };
}

module.exports = PacketWapper