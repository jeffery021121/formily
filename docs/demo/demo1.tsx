// import { observable, autorun } from '@formily/reactive'
// import React from 'react'

// const target = { num: 1 }
// const obs = observable(target)

// const tracker = () => {
//   console.log('tracker', obs.num)
// }

// autorun(tracker)
// export default function Index() {
//   return (
//     <div
//       onClick={() => {
//         obs.num = new Date().getTime()
//       }}
//     >
//       demo1，target为简单对象，设置的value不会被响应式代理
//     </div>
//   )
// }
