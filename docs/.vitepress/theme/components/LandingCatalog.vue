<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

type FeatureGroup = {
  id: string
  title: string
  intro: string
  items: Array<{ name: string; detail: string }>
}

const props = defineProps<{ groups: FeatureGroup[] }>()

const query = ref('')
const selectedGroup = ref('all')
const searchInput = ref<HTMLInputElement | null>(null)
const terms = computed(() => query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean))
const activeGroup = computed(() => props.groups.some(group => group.id === selectedGroup.value) ? selectedGroup.value : 'all')
const totalCount = computed(() => props.groups.reduce((total, group) => total + group.items.length, 0))
const filteredGroups = computed(() => props.groups
  .filter(group => activeGroup.value === 'all' || group.id === activeGroup.value)
  .map(group => ({
    ...group,
    items: group.items.filter(item => {
      const text = `${item.name} ${item.detail}`.toLocaleLowerCase()
      return terms.value.every(term => text.includes(term))
    }),
  }))
  .filter(group => group.items.length > 0))
const resultCount = computed(() => filteredGroups.value.reduce((total, group) => total + group.items.length, 0))
const isFiltered = computed(() => terms.value.length > 0 || activeGroup.value !== 'all')

async function resetFilters() {
  query.value = ''
  selectedGroup.value = 'all'
  await nextTick()
  searchInput.value?.focus()
}

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}
</script>

<template>
  <div class="landing-catalog">
    <div class="catalog-tools">
      <form class="catalog-search" role="search" aria-label="搜索软件功能" @submit.prevent>
        <label class="search-field">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.8" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            ref="searchInput"
            v-model="query"
            type="search"
            placeholder="搜索功能或关键词"
            aria-label="搜索功能名称或说明"
            autocomplete="off"
            spellcheck="false"
            @keydown.esc.prevent="clearSearch"
          >
        </label>
        <button v-if="query" class="clear-search" type="button" aria-label="清除搜索内容" @click="clearSearch">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
      </form>
      <p class="result-count" role="status" aria-live="polite" aria-atomic="true">
        {{ isFiltered ? '找到' : '共' }} <strong>{{ resultCount }}</strong> 项功能
      </p>
    </div>

    <div class="catalog-filters" role="group" aria-label="按功能类别筛选">
      <button type="button" :aria-pressed="activeGroup === 'all'" @click="selectedGroup = 'all'">
        全部<span>{{ totalCount }}</span>
      </button>
      <button v-for="group in groups" :key="group.id" type="button" :aria-pressed="activeGroup === group.id" @click="selectedGroup = group.id">
        {{ group.title }}<span>{{ group.items.length }}</span>
      </button>
    </div>

    <div v-if="filteredGroups.length" class="catalog-groups">
      <section v-for="group in filteredGroups" :key="group.id" class="catalog-group">
        <div class="group-intro">
          <span class="group-index" aria-hidden="true">{{ String(groups.findIndex(item => item.id === group.id) + 1).padStart(2, '0') }}</span>
          <h3>{{ group.title }}</h3>
          <p>{{ group.intro }}</p>
        </div>
        <ul class="feature-list">
          <li v-for="item in group.items" :key="item.name" class="feature-item">
            <h4>{{ item.name }}</h4>
            <p>{{ item.detail }}</p>
          </li>
        </ul>
      </section>
    </div>

    <div v-else class="catalog-empty">
      <p class="empty-title">没有找到匹配的功能</p>
      <p>试试更短的关键词，或清除筛选查看完整功能。</p>
      <button type="button" @click="resetFilters">清除筛选</button>
    </div>
  </div>
</template>

<style scoped>
.landing-catalog {
  --catalog-ink: var(--lp-ink, #283344);
  --catalog-muted: var(--lp-muted, #657080);
  --catalog-line: var(--lp-line, #dce1e8);
  --catalog-accent: var(--lp-accent, #c73d66);
  --catalog-surface: var(--lp-surface, #fafbfd);
  color: var(--catalog-ink);
  min-width: 0;
  text-align: left;
}

.catalog-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 22px;
}

.catalog-search {
  display: flex;
  align-items: center;
  width: min(100%, 450px);
  min-width: 0;
  border-bottom: 1px solid var(--catalog-line);
  background: transparent;
}

.catalog-search:focus-within { border-color: var(--catalog-accent); }
.search-field { display: flex; align-items: center; flex: 1; min-width: 0; gap: 12px; }
.search-field > svg { width: 19px; height: 19px; flex: 0 0 auto; color: var(--catalog-muted); }
svg { stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.search-field input {
  display: block;
  min-width: 0;
  width: 100%;
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: 0;
  color: var(--catalog-ink);
  background: transparent;
  font: inherit;
  font-size: 14px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}
.search-field input::placeholder { color: var(--catalog-muted); opacity: 1; }
.search-field input::-webkit-search-cancel-button { display: none; }
.catalog-search:has(input:focus-visible) { outline: 2px solid var(--catalog-accent); outline-offset: 5px; }
.clear-search { display: grid; place-items: center; flex: 0 0 40px; height: 44px; color: var(--catalog-muted); }
.clear-search svg { width: 18px; height: 18px; }
.result-count { flex: 0 0 auto; margin: 0; color: var(--catalog-muted); font-size: 13px; line-height: 1.5; }
.result-count strong { color: var(--catalog-ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.catalog-filters { display: flex; flex-wrap: wrap; gap: 5px 10px; padding-bottom: 24px; }
button { font: inherit; cursor: pointer; border: 0; background: transparent; }
button:focus-visible { outline: 2px solid var(--catalog-accent); outline-offset: 4px; border-radius: 3px; }
.catalog-filters button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 42px;
  padding: 8px 13px;
  border-radius: 5px;
  color: var(--catalog-muted);
  font-size: 13px;
  line-height: 1.5;
  transition: color 160ms ease, background-color 160ms ease;
}
.catalog-filters button span { font-size: 10px; font-variant-numeric: tabular-nums; opacity: .72; }
.catalog-filters button[aria-pressed="true"] { color: var(--catalog-ink); background: var(--catalog-surface); box-shadow: inset 0 -2px 0 var(--catalog-accent); }
.catalog-group { display: grid; grid-template-columns: minmax(180px, .76fr) minmax(0, 2fr); gap: clamp(28px, 5vw, 76px); padding: 34px 0 26px; border-top: 1px solid var(--catalog-line); }
.group-intro { min-width: 0; padding-top: 2px; }
.group-index { display: block; margin-bottom: 12px; color: var(--catalog-muted); font-size: 11px; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: .08em; }
.group-intro h3 { margin: 0 0 11px; padding: 0; border: 0; color: var(--catalog-ink); font-size: clamp(20px, 2vw, 25px); line-height: 1.4; font-weight: 600; letter-spacing: -.025em; }
.group-intro p { max-width: 28ch; margin: 0; color: var(--catalog-muted); font-size: 13px; line-height: 1.8; }
.feature-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 clamp(20px, 3vw, 44px); margin: 0; padding: 0; list-style: none; }
.feature-item { min-width: 0; margin: 0; padding: 0 0 20px; }
.feature-item:nth-child(n+3) { padding-top: 18px; border-top: 1px solid var(--catalog-line); }
.feature-item h4 { margin: 0 0 7px; color: var(--catalog-ink); font-size: 15px; font-weight: 550; line-height: 1.5; letter-spacing: -.01em; overflow-wrap: anywhere; }
.feature-item p { margin: 0; color: var(--catalog-muted); font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
.catalog-empty { padding: 56px 0; border-top: 1px solid var(--catalog-line); }
.catalog-empty p { margin: 0 0 12px; color: var(--catalog-muted); font-size: 14px; line-height: 1.8; }
.catalog-empty .empty-title { color: var(--catalog-ink); font-size: 19px; font-weight: 550; }
.catalog-empty button { min-height: 44px; margin-top: 9px; padding: 10px 0; color: var(--catalog-accent); font-size: 14px; text-decoration: underline; text-underline-offset: 5px; }

@media (hover: hover) {
  .catalog-filters button:hover { color: var(--catalog-ink); background: var(--catalog-surface); }
  .clear-search:hover { color: var(--catalog-accent); }
}

@media (max-width: 760px) {
  .catalog-tools { flex-direction: column; align-items: stretch; gap: 12px; }
  .catalog-search { width: 100%; }
  .result-count { text-align: right; }
  .catalog-group { grid-template-columns: 1fr; gap: 25px; padding-top: 28px; }
  .group-intro { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 0 10px; align-items: baseline; }
  .group-index { margin: 0; }
  .group-intro h3 { margin-bottom: 7px; }
  .group-intro p { grid-column: 2; max-width: none; }
  .catalog-filters { gap: 4px; padding-bottom: 20px; }
  .catalog-filters button { padding-inline: 10px; }
}

@media (max-width: 480px) {
  .search-field { gap: 9px; }
  .search-field input { font-size: 16px; }
  .feature-list { grid-template-columns: 1fr; }
  .feature-item { padding-bottom: 16px; }
  .feature-item:nth-child(n+2) { padding-top: 16px; border-top: 1px solid var(--catalog-line); }
}

@media (prefers-reduced-motion: reduce) {
  .catalog-filters button { transition: none; }
}
</style>
