/* eslint-disable no-console */
import { IOperation } from './types'
import { ObserverListeners } from './environment'
import { raw as getRaw } from './externals'
import { isFn } from './checkers'
import { DataChange, getDataNode } from './tree'

export const observe = (
  target: object,
  observer?: (change: DataChange) => void,
  deep = true
) => {
  const addListener = (target: any) => {
    const raw = getRaw(target)

    // NOTE: 初始侦测对象
    const node = getDataNode(raw)

    const listener = (operation: IOperation) => {
      // NOTE: 本函数在任何一个reaction执行时，都会触发。
      const targetRaw = getRaw(operation.target)
      const targetNode = getDataNode(targetRaw)

      if (deep) {
        // NOTE: 过滤不相关target
        if (node.contains(targetNode)) {
          observer(new DataChange(operation, targetNode))
          return
        }
      }

      // NOTE: 过滤不相关target
      if (
        node === targetNode ||
        (node.targetRaw === targetRaw && node.key === operation.key)
      ) {
        observer(new DataChange(operation, targetNode))
      }
    }

    if (node && isFn(observer)) {
      ObserverListeners.add(listener)
    }
    return () => {
      ObserverListeners.delete(listener)
    }
  }
  if (target && typeof target !== 'object')
    throw Error(`Can not observe ${typeof target} type.`)
  return addListener(target)
}
