import Vue from 'vue'
import Vuex from "vuex";
import getters from './getters'
import user from "./modules/user"
import network from "./modules/network";

import createPersistedState from 'vuex-persistedstate';

Vue.use(Vuex)

const store = new Vuex.Store({
  plugins:[
    createPersistedState({
      paths: ['user']
    })
  ],
  modules: {
    user,
    network
  },
  getters
})

export default store
