global.chartCPU = function () {
    if (CPU.length > 1000) {
        CPU.splice(0, CPU.length - 200)
    }
    let x = 0,
        xpoints = [],
        maxXValue = CPU.length,
        maxYValue = Math.max(...CPU);

    for (let value of CPU) {
        let y = value / maxYValue,
            xpoint = 46 * x / maxXValue + 2;
        xpoints.push([xpoint, 10 - 10 * y]);
        x++;
    }

    new RoomVisual().rect(0, 0, 49 * x / maxXValue, 13, { fill: 'black' });

    new RoomVisual().line(2, 10, 45 * x / maxXValue + 5, 10, { color: 'white', lineStyle: 'solid' });
    new RoomVisual().text("0", 1, 10);

    new RoomVisual().poly(xpoints, { color: 'white', lineStyle: 'solid' });

    new RoomVisual().line(2, 10 - 10 * (20 / maxYValue), 44 * x / maxXValue + 5, 10 - 10 * (20 / maxYValue), { color: 'red', lineStyle: 'dashed' });
    new RoomVisual().text("20", 1, 10 - 10 * (20 / maxYValue));

    new RoomVisual().line(2, 10 - 10 * (10 / maxYValue), 44 * x / maxXValue + 5, 10 - 10 * (10 / maxYValue), { color: 'red', lineStyle: 'dashed' });
    new RoomVisual().text("10", 1, 10 - 10 * (10 / maxYValue));

    new RoomVisual().line(2, 10 - 10 * (30 / maxYValue), 44 * x / maxXValue + 5, 10 - 10 * (30 / maxYValue), { color: 'red', lineStyle: 'dashed' });
    new RoomVisual().text("30", 1, 10 - 10 * (30 / maxYValue));

    new RoomVisual().line(2, 10 - 10 * ((_.sum(CPU) / CPU.length) / maxYValue), 44 * x / maxXValue + 5, 10 - 10 * ((_.sum(CPU) / CPU.length) / maxYValue), { color: 'green', lineStyle: 'dashed' });
    new RoomVisual().text("Avg", 1, 10 - 10 * (_.sum(CPU) / CPU.length) / maxYValue, { color: 'green' });

    new RoomVisual().text("Now: " + Game.cpu.getUsed().toFixed(2), 5, 12, { color: 'white', strokeWidth: 0.2 })
    new RoomVisual().text("Bucket: " + Game.cpu.bucket, 15, 12, { color: 'white', strokeWidth: 0.2 });
    new RoomVisual().text("Avg: " + Math.round(100 * (_.sum(CPU) / CPU.length)) / 100, 25, 12, { color: 'white', strokeWidth: 0.2 });
    new RoomVisual().text("Min: " + Math.round(100 * _.min(CPU)) / 100, 35, 12, { color: 'white', strokeWidth: 0.2 });
    new RoomVisual().text("# ticks: " + CPU.length, 45, 12, { color: 'white', strokeWidth: 0.2 });
}