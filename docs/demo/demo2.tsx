// import { observable, autorun } from '@formily/reactive'
// import React from 'react'

// const target = { o1: { num: 1 } }
// const obs = observable(target)

// const tracker = () => {
//   console.log('tracker', obs.o1)
// }

// autorun(tracker)

// export default function Index() {
//   return (
//     <div
//       onClick={() => {
//         obs.o1 = { num: new Date().getTime() }
//       }}
//     >
//       demo2，target为嵌套对象，设置的value会被响应式代理
//     </div>
//   )
// }
