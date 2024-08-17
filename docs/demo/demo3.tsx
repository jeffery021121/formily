// import { observable, autorun } from '@formily/reactive'
// import React from 'react'

// const target = { o1: { num1: 1 }, o2: { num2: 1 } }
// const target2 = { o1: { num1: 1 }, o2: { num2: 1 } }
// const obs = observable(target)
// const obs2 = observable(target2)
// const countRef = { count: 0 }

// const tracker = () => {
//   console.log('countRef.count', countRef.count)
//   if (countRef.count < 5) {
//     console.log('tracker1', obs.o1)
//   } else {
//     console.log('tracker2', obs2.o2)
//   }
// }

// autorun(tracker)

// function Demo3() {
//   return (
//     <>
//       <div
//         onClick={() => {
//           obs.o1 = { num1: new Date().getTime() }
//           countRef.count++
//         }}
//       >
//         demo3, 需要重新绑定 reaction 和 响应式数据 的场景, 只改变o1
//       </div>
//       <div
//         onClick={() => {
//           obs2.o2 = { num2: new Date().getTime() }
//           countRef.count++
//         }}
//       >
//         demo3, 需要重新绑定 reaction 和 响应式数据 的场景, 只改变o2
//       </div>
//     </>
//   )
// }
// export default Demo3
