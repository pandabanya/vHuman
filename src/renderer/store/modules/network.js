import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

// 用来存储数据
const state = {
    connected: true
}
// 响应组件中的事件
const actions = {
    changeNetworkStatus({commit}, connected) {
        commit('SET_CONNECTED', connected)
    }
}
// 操作数据
const mutations = {
    SET_CONNECTED: (state, connected) => {
        state.connected = connected
    }
}

export default {
    namespace: true,
    state,
    actions,
    mutations
}
