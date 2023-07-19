function test(a, option) {
  let { b, c, d } = option
  if (c === undefined) {
    c = 2
  }
  console.log('a: ' + a)
  console.log('b: ' + b)
  console.log('c: ' + c)
  console.log('d: ' + d)

  const obj = { c, d }
  console.log(JSON.stringify(obj))
}

test(0, { b: 1 })