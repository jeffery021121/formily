import { observable, autorun } from '@formily/reactive'
import React from 'react'

const target = { num: 1 }
const obs = observable(target)
const tracker = () => {
  console.log('tracker', obs.num)
}

autorun(tracker)

export default function Index() {
  return (
    <div
      onClick={() => {
        obs.num = new Date().getTime()
      }}
    >
      react
    </div>
  )
}

// 将数据设置到 RawNode 上，还没看到有什么作用
// 通过createNormalProxy，会对 target创建一个代理对象 proxy。
// proxy由通过new Proxy(target, baseHandlers)创建，baseHandlers中会对get方法和set方法进行拦截。
// 将数据设置到 ProxyRaw({[proxy]:[target]}) 和 RawProxy({[target]:[proxy]}) 上
// 而baseHandlers的get方法中，会创建reactionsMap,并将其分别放入RawReactionsMap和reaction._reactionsSet中。
// baseHandlers的set方法，会通过runReactions方法，将reactionsMap中的reaction执行一遍。

/**
 * autoRun
 * 改函数会创建一个reaction函数，并且该函数执行的时候，会执行autoRun的参数tracker.
 */
