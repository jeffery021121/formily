/* eslint-disable no-console */
import { isFn } from './checkers'
import { ArraySet } from './array'
import { IOperation, ReactionsMap, Reaction, PropertyKey } from './types'
import {
  ReactionStack,
  PendingScopeReactions,
  BatchEndpoints,
  DependencyCollected,
  RawReactionsMap,
  PendingReactions,
  BatchCount,
  UntrackCount,
  BatchScope,
  ObserverListeners,
} from './environment'

const ITERATION_KEY = Symbol('iteration key')

const addRawReactionsMap = (
  target: any,
  key: PropertyKey,
  reaction: Reaction
) => {
  const reactionsMap = RawReactionsMap.get(target)
  if (reactionsMap) {
    const reactions = reactionsMap.get(key)
    if (reactions) {
      reactions.add(reaction)
    } else {
      reactionsMap.set(key, new ArraySet([reaction]))
    }
    return reactionsMap
  } else {
    const reactionsMap: ReactionsMap = new Map([
      [key, new ArraySet([reaction])],
    ])
    RawReactionsMap.set(target, reactionsMap)
    return reactionsMap
  }
}

const addReactionsMapToReaction = (
  reaction: Reaction,
  reactionsMap: ReactionsMap
) => {
  const bindSet = reaction._reactionsSet
  if (bindSet) {
    bindSet.add(reactionsMap)
  } else {
    reaction._reactionsSet = new ArraySet([reactionsMap])
  }
  return bindSet
}

const getReactionsFromTargetKey = (target: any, key: PropertyKey) => {
  const reactionsMap = RawReactionsMap.get(target)
  const reactions = []
  if (reactionsMap) {
    // NOTE: 这里其实是arraySet
    const map = reactionsMap.get(key)
    if (map) {
      map.forEach((reaction) => {
        if (reactions.indexOf(reaction) === -1) {
          reactions.push(reaction)
        }
      })
    }
  }
  return reactions
}

const runReactions = (target: any, key: PropertyKey) => {
  const reactions = getReactionsFromTargetKey(target, key)
  const prevUntrackCount = UntrackCount.value
  UntrackCount.value = 0
  for (let i = 0, len = reactions.length; i < len; i++) {
    const reaction = reactions[i]
    if (reaction._isComputed) {
      // NOTE: 计算属性不用管batch逻辑
      reaction._scheduler(reaction)
    } else if (isScopeBatching()) {
      // NOTE: scopeBatch的reaction，不需要防抖，直接执行
      PendingScopeReactions.add(reaction)
    } else if (isBatching()) {
      // NOTE: 因为批量更新，所有reaction都进入了这里
      PendingReactions.add(reaction)
    } else {
      // never reach
      if (isFn(reaction._scheduler)) {
        reaction._scheduler(reaction)
      } else {
        reaction()
      }
    }
  }
  UntrackCount.value = prevUntrackCount
}

const notifyObservers = (operation: IOperation) => {
  ObserverListeners.forEach((fn) => fn(operation))
}

export const bindTargetKeyWithCurrentReaction = (operation: IOperation) => {
  let { key, type, target } = operation
  if (type === 'iterate') {
    key = ITERATION_KEY
  }
  const reactionLen = ReactionStack.length
  if (reactionLen === 0) return
  const current = ReactionStack[reactionLen - 1]
  if (isUntracking()) return
  if (current) {
    DependencyCollected.value = true

    // NOTE: 构建并返回reactionsMap，同时把reactionsMap添加到RawReactionsMap中
    const reactionsMap = addRawReactionsMap(target, key, current)

    // NOTE: 把reactionsMap添加到reaction._reactionsSet中
    addReactionsMapToReaction(current, reactionsMap)

    // NOTE: 使用 demo3，演示reaction为何要重新绑定响应式对象
    // console.log('reaction._reactionsSet', current._reactionsSet)
  }
}

export const bindComputedReactions = (reaction: Reaction) => {
  if (isFn(reaction)) {
    const current = ReactionStack[ReactionStack.length - 1]
    if (current) {
      const computes = current._computesSet
      if (computes) {
        computes.add(reaction)
      } else {
        current._computesSet = new ArraySet([reaction])
      }
    }
  }
}

export const runReactionsFromTargetKey = (operation: IOperation) => {
  let { key, type, target, oldTarget } = operation
  // NOTE: 开启批量更新
  batchStart()
  notifyObservers(operation)
  if (type === 'clear') {
    oldTarget.forEach((_: any, key: PropertyKey) => {
      runReactions(target, key)
    })
  } else {
    // NOTE: 找到和key相关的reactions，放入PendingReactions中
    runReactions(target, key)
  }
  if (type === 'add' || type === 'delete' || type === 'clear') {
    const newKey = Array.isArray(target) ? 'length' : ITERATION_KEY
    runReactions(target, newKey)
  }
  // NOTE: 结束批量更新，执行PendingReactions中的所有reaction
  batchEnd()
}

export const hasRunningReaction = () => {
  return ReactionStack.length > 0
}

export const releaseBindingReactions = (reaction: Reaction) => {
  reaction._reactionsSet?.forEach((reactionsMap) => {
    // debugger
    reactionsMap.forEach((reactions) => {
      reactions.delete(reaction)
    })
  })
  PendingReactions.delete(reaction)
  PendingScopeReactions.delete(reaction)
  delete reaction._reactionsSet
}

export const suspendComputedReactions = (current: Reaction) => {
  current._computesSet?.forEach((reaction) => {
    const reactions = getReactionsFromTargetKey(
      reaction._context,
      reaction._property
    )
    if (reactions.length === 0) {
      disposeBindingReactions(reaction)
      reaction._dirty = true
    }
  })
}

export const disposeBindingReactions = (reaction: Reaction) => {
  reaction._disposed = true
  releaseBindingReactions(reaction)
  suspendComputedReactions(reaction)
}

export const batchStart = () => {
  BatchCount.value++
}

export const batchEnd = () => {
  BatchCount.value--
  if (BatchCount.value === 0) {
    const prevUntrackCount = UntrackCount.value
    UntrackCount.value = 0
    executePendingReactions()
    executeBatchEndpoints()
    UntrackCount.value = prevUntrackCount
  }
}

export const batchScopeStart = () => {
  BatchScope.value = true
}

export const batchScopeEnd = () => {
  const prevUntrackCount = UntrackCount.value
  BatchScope.value = false
  UntrackCount.value = 0
  PendingScopeReactions.batchDelete((reaction) => {
    if (isFn(reaction._scheduler)) {
      reaction._scheduler(reaction)
    } else {
      reaction()
    }
  })
  UntrackCount.value = prevUntrackCount
}

export const untrackStart = () => {
  UntrackCount.value++
}

export const untrackEnd = () => {
  UntrackCount.value--
}

export const isBatching = () => BatchCount.value > 0

export const isScopeBatching = () => BatchScope.value

export const isUntracking = () => UntrackCount.value > 0

export const executePendingReactions = () => {
  // NOTE: 执行所有的reaction，优先执行reaction的调度器
  PendingReactions.batchDelete((reaction) => {
    if (isFn(reaction._scheduler)) {
      reaction._scheduler(reaction)
    } else {
      reaction()
    }
  })
}

export const executeBatchEndpoints = () => {
  BatchEndpoints.batchDelete((callback) => {
    callback()
  })
}

export const hasDepsChange = (newDeps: any[], oldDeps: any[]) => {
  if (newDeps === oldDeps) return false
  if (newDeps.length !== oldDeps.length) return true
  if (newDeps.some((value, index) => value !== oldDeps[index])) return true
  return false
}

export const disposeEffects = (reaction: Reaction) => {
  if (reaction._effects) {
    try {
      batchStart()
      reaction._effects.queue.forEach((item) => {
        if (!item || !item.dispose) return
        item.dispose()
      })
    } finally {
      batchEnd()
    }
  }
}
