const { simpleAllies } = require("./simpleAllies")

Overlord.manageAllies = function () {
  simpleAllies.initRun()

  this.respondToResourceRequests()

  simpleAllies.endRun()
}

Overlord.respondToResourceRequests = function () {

  // Other players want resources, let's send them some!

  const resourceRequests = simpleAllies.allySegmentData ? simpleAllies.allySegmentData.requests.resource : undefined
  if (!resourceRequests) return

  for (const request of resourceRequests) {
    // console.log(JSON.stringify(request))
  }
}

function sendResource(request) {

  // Just an example. You'd probably want to call terminal.send() to properly respond to the request
}