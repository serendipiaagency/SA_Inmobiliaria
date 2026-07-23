<template>
  <div>
    <div class="flex gap-3">
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-600">{{ comment.authorName?.[0]?.toUpperCase() }}</span>
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <p class="text-sm font-semibold">{{ comment.authorName }}</p>
          <p class="text-xs text-stone-400">{{ new Date(comment.createdAt).toLocaleDateString('es-ES') }}</p>
        </div>
        <p class="mt-1 text-sm text-stone-600">{{ comment.content }}</p>
        <button v-if="replyingTo !== comment.id" class="mt-1 text-xs font-medium text-stone-450 hover:text-ink hover:underline" @click="$emit('reply', comment.id)">Responder</button>

        <form v-if="replyingTo === comment.id" class="mt-3 space-y-2 rounded-lg border border-line bg-stone-50 p-3" @submit.prevent="$emit('submit-reply', comment.id)">
          <div class="grid gap-2 sm:grid-cols-2">
            <input v-model="form.authorName" class="input !py-1.5 text-sm" placeholder="Tu nombre" required />
            <input v-model="form.authorEmail" type="email" class="input !py-1.5 text-sm" placeholder="Email (opcional)" />
          </div>
          <textarea v-model="form.content" class="input text-sm" rows="2" placeholder="Escribe tu respuesta…" required />
          <div class="flex gap-2">
            <button type="submit" class="btn-primary !py-1.5 text-xs">Responder</button>
            <button type="button" class="btn-secondary !py-1.5 text-xs" @click="$emit('reply', null)">Cancelar</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="comment.replies?.length" class="ml-11 mt-4 space-y-4 border-l border-line pl-4">
      <CmsCommentThread
        v-for="reply in comment.replies"
        :key="reply.id"
        :comment="reply"
        :replying-to="replyingTo"
        @reply="$emit('reply', $event)"
        @submit-reply="$emit('submit-reply', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ comment: any; replyingTo: number | null }>()
defineEmits<{ reply: [number | null]; 'submit-reply': [number] }>()

// The reply form's own local state — the parent page reads it via the shared
// commentForm when submit-reply fires (see pages/blog/[slug].vue).
const form = inject<any>('cmsCommentForm')
</script>
