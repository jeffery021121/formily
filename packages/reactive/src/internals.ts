/* eslint-disable no-console */
import { isFn, isCollectionType, isNormalType } from './checkers'
import {
  RawProxy,
  ProxyRaw,
  MakeObModelSymbol,
  RawShallowProxy,
} from './environment'
import { baseHandlers, collectionHandlers } from './handlers'
import { buildDataTree, getDataNode } from './tree'
import { isSupportObservable } from './externals'
import { PropertyKey, IVisitor, BoundaryFunction } from './types'

const createNormalProxy = (target: any, shallow?: boolean) => {
  const proxy = new Proxy(target, baseHandlers)
  ProxyRaw.set(proxy, target)
  if (shallow) {
    RawShallowProxy.set(target, proxy)
  } else {
    RawProxy.set(target, proxy)
  }
  return proxy
}

const createCollectionProxy = (target: any, shallow?: boolean) => {
  const proxy = new Proxy(target, collectionHandlers)
  ProxyRaw.set(proxy, target)
  if (shallow) {
    RawShallowProxy.set(target, proxy)
  } else {
    RawProxy.set(target, proxy)
  }
  return proxy
}

const createShallowProxy = (target: any) => {
  if (isNormalType(target)) return createNormalProxy(target, true)
  if (isCollectionType(target)) return createCollectionProxy(target, true)
  // never reach
  return target
}

export const createObservable = (
  target: any,
  key?: PropertyKey,
  value?: any,
  shallow?: boolean
) => {
  if (typeof value !== 'object') return value
  const raw = ProxyRaw.get(value)
  if (!!raw) {
    const node = getDataNode(raw)
    if (!node.target) node.target = target
    node.key = key
    return value
  }

  if (!isSupportObservable(value)) return value

  if (target) {
    // NOTE: 因为这里是处理value的响应式的，而 value 是 target[key]，所以这里的 target 是 value 的父对象
    const parentRaw = ProxyRaw.get(target) || target
    const isShallowParent = RawShallowProxy.get(parentRaw)
    // NOTE: 如果父对象是shallow的，那么value也是shallow的，不需要再次创建proxy
    if (isShallowParent) return value
  }
  buildDataTree(target, key, value)
  if (shallow) return createShallowProxy(value)

  // debugger
  // NOTE: 将value变为响应式对象
  if (isNormalType(value)) return createNormalProxy(value)
  if (isCollectionType(value)) return createCollectionProxy(value)
  // never reach
  return value
}

export const createAnnotation = <T extends (visitor: IVisitor) => any>(
  maker: T
) => {
  const annotation = (target: any): ReturnType<T> => {
    return maker({ value: target })
  }
  if (isFn(maker)) {
    annotation[MakeObModelSymbol] = maker
  }
  return annotation
}

export const getObservableMaker = (target: any) => {
  if (target[MakeObModelSymbol]) {
    if (!target[MakeObModelSymbol][MakeObModelSymbol]) {
      return target[MakeObModelSymbol]
    }
    return getObservableMaker(target[MakeObModelSymbol])
  }
}

export const createBoundaryFunction = (
  start: (...args: any) => void,
  end: (...args: any) => void
) => {
  // NOTE: fn就是包含用户参数和用户方法的一个柯里化函数。它在start和end之间执行，就实现了boundary的功能
  function boundary<F extends (...args: any) => any>(fn?: F): ReturnType<F> {
    let results: ReturnType<F>
    try {
      start()
      if (isFn(fn)) {
        results = fn()
      }
    } finally {
      end()
    }
    return results
  }

  boundary.bound = createBindFunction(boundary)
  return boundary
}

// NOTE: 直接看下面createBindFunction curry版本的解析
export const createBindFunction = <Boundary extends BoundaryFunction>(
  boundary: Boundary
) => {
  function bind<F extends (...args: any[]) => any>(
    callback?: F,
    context?: any
  ): F {
    return ((...args: any[]) =>
      boundary(() => callback.apply(context, args))) as any
  }
  return bind
}
/* 
export const createBindFunction = // NOTE: 这个函数是createBindFunction的curry版本
  (boundary) => // NOTE: 此时boundary已经柯里化了start和end
  (callback, context) => // NOTE:  在define中执行，柯里化用户方法和context，返回的函数就是下文设计思路分析中的lastCurryFn啦
  (...args) => // NOTE: 用户调用，传递用户参数
    boundary(() => callback.apply(context, args)) // NOTE: start -> target[key] -> end
 */

/**
 * NOTE: 设计思路：
 * 1. 将maker函数的的start和end方法，柯里化到boundary函数中
 * 2. 将用户的target[key]方法，柯里化到boundary函数的boundary.bound上，并具有接收用户参数的功能
 * 3. 当用户调用target[key]方法时，实际上调用的是boundary.bound函数的返回函数，就叫 lastCurryFn 吧
 * 4. 由于lastCurryFn是用户调用的，所以会接收用户的参数
 * 5. lastCurryFn执行就会调用boundary函数，并且 boundary函数的函数参数 会封装用户的参数和方法
 * 6. boundary函数会按照 start -> target[key] -> end 的顺序执行，并且保证target[key]方法的参数传递
 * 7. 简单示意 (start,end)=>(targetFn, targetFnContext)=>(...targetFnArgs)=>(start(),targetFn.apply(targetFnContext,targetFnArgs),end())
 * 8. 实际上 start和end 是通过boundary函数柯里化的，其余参数是通过boundary.bound柯里化的，最终函数逻辑又是由boundary函数执行的，雀食牛逼
 */
// NOTE: 注意，这个函数返回的不是annotation，而是boundary函数
export const createBoundaryAnnotation = (
  start: (...args: any) => void,
  end: (...args: any) => void
) => {
  // NOTE: 将maker函数的的start和end方法，柯里化到boundary函数中
  const boundary = createBoundaryFunction(start, end)

  /**
   * NOTE:
   * define会通过boundary找到这个maker函数(两层MakeObModelSymbol查找)
   * 然后传入target和key，执行这个函数，实现和其他annotation一样的aop功能
   * 后续用户调用target[key]，传入参数，就会执行lastCurryFn，实现boundary的功能
   */
  const annotation = createAnnotation(({ target, key }) => {
    // NOTE: 覆写target[key]，把用户的target[key]柯里化到boundary函数的boundary.bound上
    target[key] = boundary.bound(target[key], target)
    return target
  })
  boundary[MakeObModelSymbol] = annotation
  boundary.bound[MakeObModelSymbol] = annotation
  return boundary
}
