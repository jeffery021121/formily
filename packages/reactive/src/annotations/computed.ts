/* eslint-disable no-console */
import { ObModelSymbol, ReactionStack } from '../environment'
import { createAnnotation } from '../internals'
import { buildDataTree } from '../tree'
import { isFn } from '../checkers'
import {
  bindTargetKeyWithCurrentReaction,
  runReactionsFromTargetKey,
  bindComputedReactions,
  hasRunningReaction,
  isUntracking,
  batchStart,
  batchEnd,
  releaseBindingReactions,
} from '../reaction'

interface IValue<T = any> {
  value?: T
}
export interface IComputed {
  <T>(compute: () => T): IValue<T>
  <T>(compute: { get?: () => T; set?: (value: T) => void }): IValue<T>
}

const getDescriptor = Object.getOwnPropertyDescriptor

const getProto = Object.getPrototypeOf

const ClassDescriptorSymbol = Symbol('ClassDescriptorSymbol')

function getPropertyDescriptor(obj: any, key: PropertyKey) {
  if (!obj) return
  return getDescriptor(obj, key) || getPropertyDescriptor(getProto(obj), key)
}

function getPropertyDescriptorCache(obj: any, key: PropertyKey) {
  const constructor = obj.constructor
  if (constructor === Object || constructor === Array)
    return getPropertyDescriptor(obj, key)
  const cache = constructor[ClassDescriptorSymbol] || {}
  const descriptor = cache[key]
  if (descriptor) return descriptor
  const newDesc = getPropertyDescriptor(obj, key)
  constructor[ClassDescriptorSymbol] = cache
  cache[key] = newDesc
  return newDesc
}

function getPrototypeDescriptor(
  target: any,
  key: PropertyKey,
  value: any
): PropertyDescriptor {
  if (!target) {
    if (value) {
      if (isFn(value)) {
        return { get: value }
      } else {
        return value
      }
    }
    return {}
  }
  const descriptor = getPropertyDescriptorCache(target, key)
  if (descriptor) {
    return descriptor
  }
  return {}
}
/* 
class Aaa{
get computed1() {
    return this.deep.aa + this.box.get()
  }
}
  aaa = new Aaa()
  aaa.computed1
  
*/
// NOTE: computed类型的注解比较特殊，它必须要写getter定义，并且在定义内使用依赖数据。
export const computed: IComputed = createAnnotation(
  ({ target, key, value }) => {
    const store: IValue = {}

    const proxy = {}

    const context = target ? target : store
    const property = target ? key : 'value'
    const descriptor = getPrototypeDescriptor(target, property, value)

    // NOTE: 用户传入的getter函数
    function compute() {
      // NOTE: 执行getter函数，会去访问相应依赖数据
      store.value = descriptor.get?.call(context)
    }

    /**
     * NOTE:
     * computed的reaction定义，只有在计算属性被访问时，才会初次执行
     * 一般情况下，计算属性被访问时，ReactionStack本身至少是有一个reaction的
     * 例如：计算属性是在函数组件中被访问的，那函数组件本身是一个reaction，计算属性又自带一个reaction。
     * 计算属性reaction 执行，会让计算属性的getter中使用到的可侦测数据 和 计算属性的reaction 绑定。
     */
    function reaction() {
      if (ReactionStack.indexOf(reaction) === -1) {
        releaseBindingReactions(reaction)
        try {
          ReactionStack.push(reaction)
          /**
           *  NOTE:
           * 这里的compute可以类比成常规reaction中的tracker函数
           * tracker执行，会访问那些依赖的数据，如果数据是响应式的，就会触发compute_reaction和数据的绑定。
           * 数据变化时，会找到本 compute_reaction ，并执行 compute_reaction._scheduler(reaction)
           */
          compute()
        } finally {
          ReactionStack.pop()
        }
      }
    }
    reaction._name = 'ComputedReaction'
    reaction._scheduler = () => {
      reaction._dirty = true

      /**
       * NOTE:
       * 这个函数在这里执行，比较不寻常，因为一般这个函数都是在劫持的setter方法中执行的。
       * 由于在下文的get函数中，已经将 计算属性的值(计算出来的结果) 和 reaction (eg: 函数组件)绑定，
       * 这里runReactionsFromTargetKey相当于是会找到 函数组件，去执行其forceUpdate.
       * 但是相比于在set中触发，这里少了一步新值和旧值的比较，这
       * 意味着只要依赖变化，计算属性就会触发外部reaction执行，不管新值和旧值是否一致。
       */

      runReactionsFromTargetKey({
        target: context,
        key: property,
        value: store.value,
        type: 'set',
      })
    }
    reaction._isComputed = true
    reaction._dirty = true
    reaction._context = context
    reaction._property = property

    // NOTE: 这里其实是对computed的getter进行覆写，算是aop吧，经过部分逻辑处理后，依然调用了原始的getter即compute函数
    function get() {
      if (hasRunningReaction()) {
        bindComputedReactions(reaction)
      }
      if (!isUntracking()) {
        //如果允许untracked过程中收集依赖，那么永远不会存在绑定，因为_dirty已经设置为false
        // NOTE: 只有开启数据追踪才会执行reaction，否则依赖数据不被追踪，就失去了响应式收集的特性，也就没必要执行reaction了。
        if (reaction._dirty) {
          // NOTE: 这里会执行reaction，会访问依赖数据，绑定依赖数据和 计算属性reaction
          reaction()
          reaction._dirty = false
        }
      } else {
        // NOTE: 这里只是简单触发下用户的getter函数，不涉及任何aop逻辑
        compute()
      }
      /**
       * NOTE:
       * 注意这里是将 覆写后的target,key 和 计算属性reaction之前的那个reaction(eg: 函数组件) 绑定
       * 这样在计算属性值变化后，才能通知函数组件更新
       */

      bindTargetKeyWithCurrentReaction({
        target: context,
        key: property,
        type: 'get',
      })
      return store.value
    }

    // NOTE: 计算属性set比较特殊，例如form.visible，这是一个计算属性，依赖于form.display，而它的set则会修改form.display
    function set(value: any) {
      try {
        batchStart()
        descriptor.set?.call(context, value)
      } finally {
        batchEnd()
      }
    }
    if (target) {
      Object.defineProperty(target, key, {
        get,
        set,
        enumerable: true,
      })
      return target
    } else {
      Object.defineProperty(proxy, 'value', {
        set,
        get,
      })
      buildDataTree(target, key, store)
      proxy[ObModelSymbol] = store
    }
    return proxy
  }
)
