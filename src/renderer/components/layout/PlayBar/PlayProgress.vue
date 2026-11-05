<template>
  <div :class="$style.content">
    <div :class="$style.timeContent">
      <span>{{ nowPlayTimeStr }}</span>
      <span style="margin: 0 1px;">/</span>
      <span>{{ maxPlayTimeStr }}</span>
    </div>
  </div>
</template>

<script>
import usePlayProgress from '@renderer/utils/compositions/usePlayProgress'

export default {
  setup() {
    const {
      nowPlayTimeStr,
      maxPlayTimeStr,
    } = usePlayProgress()

    return {
      nowPlayTimeStr,
      maxPlayTimeStr,
    }
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.content {
  flex: none;
  position: relative;
  padding: 15px 0;
}

.timeContent {
  position: relative;
  color: var(--color-550);
  font-size: 13px;
}

</style>
