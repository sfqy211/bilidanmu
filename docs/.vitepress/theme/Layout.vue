<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import LandingPage from './LandingPage.vue'
const { frontmatter } = useData()
</script>

<template>
  <LandingPage v-if="frontmatter.landing" />
  <DefaultTheme.Layout v-else />
</template>
