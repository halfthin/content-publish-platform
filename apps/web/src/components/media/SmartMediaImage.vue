<template>
  <div class="smart-media-image" :class="[variantClass, { loaded, failed }]">
    <img
      :src="src"
      :alt="alt"
      :title="title"
      :class="['smart-media-image-element', imgClass]"
      :loading="loading"
      :fetchpriority="fetchpriority"
      decoding="async"
      @load="handleLoad"
      @error="handleError"
    />
    <div v-if="!loaded && !failed" class="smart-media-image-placeholder" />
    <div v-else-if="failed" class="smart-media-image-fallback">🖼️</div>
  </div>
</template>

<script setup lang="ts">
/* biome-ignore-all lint/correctness/noUnusedVariables: Vue <script setup> bindings are consumed by the template. */
import { ref, watch } from 'vue';

interface SmartMediaImageProps {
  src: string;
  alt: string;
  title?: string;
  imgClass?: string;
  variant?: 'square' | 'natural';
  loading?: 'lazy' | 'eager';
  fetchpriority?: 'high' | 'low' | 'auto';
}

const props = withDefaults(defineProps<SmartMediaImageProps>(), {
  title: '',
  imgClass: '',
  variant: 'natural',
  loading: 'lazy',
  fetchpriority: 'auto',
});

const loaded = ref(false);
const failed = ref(false);
const variantClass = props.variant;

function handleLoad() {
  loaded.value = true;
  failed.value = false;
}

function handleError() {
  failed.value = true;
  loaded.value = false;
}

watch(
  () => props.src,
  () => {
    loaded.value = false;
    failed.value = false;
  },
  { immediate: true }
);
</script>

<style scoped>
.smart-media-image {
  position: relative;
  width: 100%;
  height: auto;
  display: block;
  overflow: hidden;
  background: #f1f5f9;
}

.smart-media-image-element {
  display: block;
  width: 100%;
  height: auto;
  background: #f1f5f9;
  transition: transform 0.22s ease;
}

.smart-media-image.square .smart-media-image-element {
  aspect-ratio: 1 / 1;
  object-fit: cover;
}

.smart-media-image.natural .smart-media-image-element {
  aspect-ratio: auto;
  object-fit: contain;
}

.smart-media-image-placeholder,
.smart-media-image-fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background:
    linear-gradient(135deg, rgba(241, 245, 249, 0.98), rgba(226, 232, 240, 0.9)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.48), rgba(255, 255, 255, 0.18));
}

.smart-media-image-placeholder {
  background-size: 100% 100%, 220% 100%;
  animation: smart-media-image-shimmer 1.6s linear infinite;
}

.smart-media-image-fallback {
  color: #94a3b8;
  font-size: 28px;
}

@keyframes smart-media-image-shimmer {
  0% {
    background-position:
      0 0,
      200% 0;
  }
  100% {
    background-position:
      0 0,
      -20% 0;
  }
}
</style>
