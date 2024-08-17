import { ReactionStack } from './environment'
import { isFn } from './checkers'
import { Reaction } from './types'
import {
  batchEnd,
  batchStart,
  disposeBindingReactions,
  releaseBindingReactions,
} from './reaction'

export class Tracker {
  private results: any
  constructor(
    scheduler?: (reaction: Reaction) => void,
    name = 'TrackerReaction'
  ) {
    // NOTE: 一般来说，scheduler里的callback就是个forceUpdate函数(setState([]))，用于触发组件的重新渲染。
    this.track._scheduler = (callback) => {
      if (this.track._boundary === 0) this.dispose()
      if (isFn(callback)) scheduler(callback)
    }
    this.track._name = name
    this.track._boundary = 0
  }

  // NOTE: 和autorun基本一致。和auto的区别是，这里不会自动先执行一次reaction。
  track: Reaction = (tracker: Reaction) => {
    if (!isFn(tracker)) return this.results
    if (this.track._boundary > 0) return
    if (ReactionStack.indexOf(this.track) === -1) {
      releaseBindingReactions(this.track)
      try {
        batchStart()
        ReactionStack.push(this.track)
        this.results = tracker()
      } finally {
        ReactionStack.pop()
        this.track._boundary++
        batchEnd()
        this.track._boundary = 0
      }
    }
    return this.results
  }

  dispose = () => {
    disposeBindingReactions(this.track)
  }
}
