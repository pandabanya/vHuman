import Recorder from "js-audio-recorder";
import path from "path";
import fs from 'fs'
// import VAD from "webrtcvad"

export default class AnceRecorder {

    constructor() {
        if (!AnceRecorder.instance) {
            AnceRecorder.instance = this;
            this.setUpRecorder()
        }
        return AnceRecorder.instance;
    }

    // instance = null;
    recorder = null;
    options = {
        // 采样位数，支持 8 或 16，默认是16
        sampleBits: 16,
        // 采样率，支持 11025、16000、22050、24000、44100、48000
        sampleRate: 16000,
        // 声道，支持 1 或 2， 默认是1
        numChannels: 1,
        // 是否边录边转换，默认是false
        compiling: true
    };

    isRecording;

    setUpRecorder() {
        if (!this.recorder) {
            this.recorder = new Recorder(this.options)
            this.isRecording = false
        }
    }

    // 销毁录音
    destroyRecorder() {
        this.recorder.destroy().then(() => {
        });
    }

    startRecord() {
        Recorder.getPermission().then(() => {
            // idle -> recording
            if (!this.isRecording) {
                this.recorder.start().then(() => {
                    console.info('---recorder start recording---')
                    this.isRecording = true
                }, (error) => {
                    this.isRecording = false
                    // 出错了
                    console.log(`start record error: ${error.name} : ${error.message}`);
                }, (e) => {
                    console.error(e)
                })
            }
        }, (error) => {
            console.info('--录音error--', error)
            this.$message.info("请先允许使用麦克风");
        })
    }

    stopRecording(resetData=false) {
        this.recorder.stop()
        if (resetData) {
            this.recorder.getWAVBlob()
        }
        this.isRecording = false
        console.info('------stopRecording------')
    }

    getWakenRecordData() {
        return this.recorder.getNextData();
    }

    getNextData() {
        return this.recorder.getNextData();
    }

    getNormalAudioData() {
        const wavBlob = this.recorder.getWAVBlob()
        const wavFile = new File([wavBlob],  new Date().getTime() + '.wav', { type: 'audio/wav' } )
        return wavFile
    }

    playWakenAudio(callback) {
        let oAudio = document.createElement('audio');
        oAudio.src = require('../assets/hello.mp3')
        oAudio.controls = false
        oAudio.autoplay = true
        oAudio.addEventListener('ended', function() {
            if (callback) {
                callback()
            }
            // 从DOM中移除音频元素
            oAudio.parentNode.removeChild(oAudio);
        })
        document.body.append(oAudio)
        // oAudio.play()
    }

    reWakenFunction = null
    uploadCallback = null
    // vad = new VAD(16000, 0)
    // voiceBuffer = Buffer.alloc(0)
    // lastVoiceTimestamp = Date.now()
    // RECORDING_THRESHOLD = 2 * 1000    // 问题结束的间隔，单位为 ms
    // findVoice = false
    // vadTimerId = null
    // audioFrameSize = 640
    // audioDataInterval = 200  // 获取音频数据的间隔，单位为 ms
    // reWakenDuration = 5 * 60 * 1000    // 需要重新唤醒的时长， 单位为 ms


    // VAD检测
    // startVAD(vadUpload, reWakenFunction) {
    //     this.reWakenFunction = reWakenFunction
    //     this.uploadCallback = vadUpload
    //     this.startRecord()
    //     this.lastVoiceTimestamp = Date.now()
    //     this.vadTimerId = setInterval(() => {
    //         let chunk = this.recorder.getNextData()
    //         // console.info('--chunk--', chunk)
    //         this.doVAD(chunk)
    //     }, this.audioDataInterval)
    // }

    // doVAD(audioChunk) {
    //     if (audioChunk && audioChunk.length > 0) {
    //         let data = []
    //         audioChunk.forEach(dataView => {
    //             data = data.concat(...Buffer.from(dataView.buffer))
    //         })
    //         let buffer = Buffer.from(data)
    //         // console.info('--buffer--', buffer.byteLength)
    //         while (buffer.byteLength >= this.audioFrameSize) {
    //             const chunk = buffer.subarray(0, this.audioFrameSize);
    //             buffer = buffer.subarray(this.audioFrameSize);
    //
    //             if(this.vad.process(chunk)) {
    //                 console.info(`voice detected`)
    //
    //                 if (!this.findVoice) {
    //                     this.findVoice = true
    //                 }
    //
    //                 if (this.findVoice) {
    //                     this.lastVoiceTimestamp = Date.now()
    //                 }
    //             } else {
    //                 console.info(`no voice detected`)
    //                 // 静音
    //                 let now = Date.now()
    //                 if (this.findVoice) {
    //                     // 此前已检测出声音，2s后再没有声音，需要停止录音
    //                     if ((now - this.lastVoiceTimestamp) > this.RECORDING_THRESHOLD) {
    //                         this.findVoice = false
    //                         clearInterval(this.vadTimerId)
    //                         this.stopRecording()
    //                         const wavBlob = this.recorder.getWAVBlob()
    //                         this.writeBlobToLocalFile(wavBlob)
    //                         this.uploadWavFile(wavBlob)
    //                     }
    //                 } else {
    //                     // 此前一直没有检测出声音，超过5分钟，停止检测，再次对话，需要唤醒
    //                     if ((now - this.lastVoiceTimestamp) > this.reWakenDuration) {
    //                         clearInterval(this.vadTimerId)
    //                         this.stopRecording(true)
    //                         if (this.reWakenFunction) {
    //                             this.reWakenFunction()
    //                         }
    //                     }
    //                 }
    //             }
    //         }
    //     }
    // }

    // writeBlobToLocalFile(wavBlob) {
    //     let fileName = `recording_${Date.now()}.wav`
    //     let recordingPath = path.join('record', fileName)
    //
    //     wavBlob.arrayBuffer().then(arrayBuffer => {
    //         const buffer = Buffer.from(arrayBuffer)
    //         fs.writeFile(recordingPath, buffer, (err)=> {
    //             if (err) {
    //                 console.info('--err--', err)
    //             } else {
    //                 console.info('---success---')
    //             }
    //         })
    //     })
    // }

    // writeDataToFile(filePath, buffer) {
    //     console.info('-----filePath--------', filePath)
    //     console.info('---to write----', buffer)
    //
    //     let wavFileWriter = fs.createWriteStream(filePath)
    //     // 将 Buffer 数据写入文件
    //     wavFileWriter.write(buffer);
    //     wavFileWriter.end(() => {
    //         this.uploadCallback(filePath)
    //     })
    // }

    // uploadWavFile(wavBlob) {
    //     if (!wavBlob) {
    //         return
    //     }
    //     let fileName = new Date().getTime() + '.wav'
    //     const wavFile = new File([wavBlob],  fileName, { type: 'audio/wav' } )
    //     let param = new FormData()
    //     param.append('file', wavFile)
    //
    //     if (this.uploadCallback) {
    //         this.uploadCallback(param, fileName)
    //     }
    // }
}

