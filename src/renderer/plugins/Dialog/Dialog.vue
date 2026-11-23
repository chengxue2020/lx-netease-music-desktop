<template>
  <Modal :show="visible" :close-btn="false" :teleport="teleport" @close="handleCancel" @after-leave="afterLeave">
    <main class="scroll" :class="[$style.main, { 'select': selection }]">{{ message }}</main>
    <footer :class="$style.footer">
      <Btn v-if="showCancel" :class="$style.btn" @click="handleCancel">{{ cancelBtnText }}</Btn>
      <Btn ref="confirmBtn" :class="$style.btn" @click="handleComfirm">{{ confirmBtnText }}</Btn>
    </footer>
  </Modal>
</template>

<script>
import Modal from '@renderer/components/material/Modal.vue'
import Btn from '@renderer/components/base/Btn.vue'
import { useI18n } from '@renderer/plugins/i18n'
import { computed } from '@common/utils/vueTools'
export default {
  components: {
    Modal,
    Btn,
  },
  props: {
    afterLeave: {
      type: Function,
      default: () => {},
    },
  },
  setup() {
    const t = useI18n()

    const defaultBtnTexts = computed(() => {
      return {
        confirm: t('confirm_button_text'),
        cancel: t('cancel_button_text'),
      }
    })

    return {
      defaultBtnTexts,
    }
  },
  data() {
    return {
      visible: false,
      message: '',
      showCancel: false,
      cancelButtonText: '',
      confirmButtonText: '',
      teleport: '#root',
      selection: false,
      focusConfirm: false,
    }
  },
  watch: {
    visible(val) {
      if (!val || !this.focusConfirm) return
      // Modal 内容经 teleport + transition 渲染，需等 DOM 就绪后再聚焦确定按钮
      void this.$nextTick(() => {
        void this.$nextTick(() => {
          const btn = this.$refs.confirmBtn?.$el
          if (btn && typeof btn.focus == 'function') btn.focus()
        })
      })
    },
  },
  computed: {
    cancelBtnText() {
      return this.cancelButtonText || this.defaultBtnTexts.cancel
    },
    confirmBtnText() {
      return this.confirmButtonText || this.defaultBtnTexts.confirm
    },
  },
  beforeUnmount() {
    const el = this.$el
    el.parentNode.removeChild(el)
  },
  methods: {
    handleCancel() {
    },
    handleComfirm() {
    },
  },
}
</script>

<style lang="less" module>

.main {
  flex: auto;
  min-height: 40px;
  padding: 15px 15px 0;
  font-size: 14px;
  // max-width: 320px;
  min-width: 220px;
  line-height: 1.5;
  white-space: pre-line;
}

.footer {
  flex: none;
  padding: 15px;
  display: flex;
  flex-flow: row nowrap;
  justify-content: flex-end;
  gap: 15px;
}
</style>
