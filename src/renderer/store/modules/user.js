import Vue from 'vue'
import Vuex from 'vuex'
import {uuid} from "@/utils/uuid-util";

Vue.use(Vuex)

// 用来存储数据
const state = {
  name: ''
}
// 响应组件中的事件
const actions = {
  // 模拟登录
  async login({state, commit}) {
    let userName = state.name
    console.info('--action-userName---', userName)
    if (!userName || userName.length === 0) {
      let name = uuid(8, 16)
      // this.$store.dispatch('login', name)
      commit('SET_NAME', name)
      console.info('--after-userName---', name)
    }
  }
}
// 操作数据
const mutations = {
  SET_NAME: (state, name) => {
    state.name = name
  }
}

export default {
  namespace: true,
  state,
  actions,
  mutations
}
