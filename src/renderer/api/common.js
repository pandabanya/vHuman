import requestFile from '@/utils/requestFile'
import axios from "axios";
import request from '@/utils/request'

const CancelToken = axios.CancelToken;

export const common_upload_file = (data, that) => {
  return requestFile({
    url: '/common/common_upload_file',
    method: 'post',
    data,
    cancelToken: new axios.CancelToken(function executor(c) { // 设置 cancel token
      that.cancel = c;
    })
  })
}


export const get_ref_doc_list = (data, that) => {
  return request({
    url: '/vector/get_ref_docs_for_question',
    method: 'post',
    data,
    cancelToken: new axios.CancelToken(function executor(c) { // 设置 cancel token
      that.cancel = c;
    })
  })
}


export const intent_recognize = (data, that) => {
  return request({
    url: '/vector/intent_recognize',
    method: 'post',
    data,
    cancelToken: new axios.CancelToken(function executor(c) { // 设置 cancel token
      that.cancel = c;
    })
  })
}