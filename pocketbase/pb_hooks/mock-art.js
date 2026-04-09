module.exports = {
  presetThemes: {
    sketch: {
      background: "#f5efdf",
      panel: "#fffaf0",
      primary: "#232323",
      secondary: "#6b6b6b",
      accent: "#b17a3e",
      strokeWidth: 3.8,
    },
    watercolor: {
      background: "#e9f2f5",
      panel: "#f9fcfd",
      primary: "#23455a",
      secondary: "#5a7b8d",
      accent: "#5fb7c8",
      strokeWidth: 4.4,
    },
    poster: {
      background: "#f6e7da",
      panel: "#fff7f0",
      primary: "#7c281f",
      secondary: "#8f5d47",
      accent: "#eb8c3a",
      strokeWidth: 5,
    },
  },

  aspectRatioSizes: {
    portrait: { width: 1200, height: 1600 },
    square: { width: 1400, height: 1400 },
    landscape: { width: 1600, height: 1100 },
  },

  coercePointArray: function (value) {
    if (!Array.isArray(value)) {
      return []
    }

    return value
      .map(function (point) {
        if (Array.isArray(point) && point.length >= 2) {
          var x = Number(point[0])
          var y = Number(point[1])
          if (Number.isFinite(x) && Number.isFinite(y)) {
            return [x, y]
          }
        }

        if (point && typeof point === "object" && "x" in point && "y" in point) {
          var px = Number(point.x)
          var py = Number(point.y)
          if (Number.isFinite(px) && Number.isFinite(py)) {
            return [px, py]
          }
        }

        return null
      })
      .filter(Boolean)
  },

  hashSeed: function (value) {
    var hash = 0
    var text = String(value || "")
    for (var i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) % 2147483647
    }
    return hash
  },

  fallbackPath: function (seedText) {
    var seed = this.hashSeed(seedText)
    var points = []
    for (var i = 0; i < 18; i += 1) {
      var x = ((seed + i * 131) % 900) / 10 + 40
      var y = ((seed + i * 197) % 1100) / 10 + 80
      points.push([x, y])
    }
    return points
  },

  extractPathPoints: function (streamRecord, activityRecord) {
    if (streamRecord) {
      var rawNormalized = streamRecord.getRaw("normalized_path_json")
      var direct = this.coercePointArray(rawNormalized)
      if (direct.length >= 2) {
        return direct
      }

      if (rawNormalized && typeof rawNormalized === "object" && Array.isArray(rawNormalized.points)) {
        var nested = this.coercePointArray(rawNormalized.points)
        if (nested.length >= 2) {
          return nested
        }
      }

      var rawLatLng = streamRecord.getRaw("latlng_stream_json")
      var latlngPoints = this.coercePointArray(rawLatLng)
      if (latlngPoints.length >= 2) {
        return latlngPoints
      }
    }

    var start = this.coercePointArray([activityRecord.getRaw("start_latlng")])
    var end = this.coercePointArray([activityRecord.getRaw("end_latlng")])
    if (start.length && end.length) {
      return [start[0], end[0]]
    }

    return this.fallbackPath(activityRecord.id)
  },

  escapeXml: function (value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  },

  scalePoints: function (points, width, height) {
    var minX = Number.POSITIVE_INFINITY
    var minY = Number.POSITIVE_INFINITY
    var maxX = Number.NEGATIVE_INFINITY
    var maxY = Number.NEGATIVE_INFINITY

    points.forEach(function (point) {
      minX = Math.min(minX, point[0])
      minY = Math.min(minY, point[1])
      maxX = Math.max(maxX, point[0])
      maxY = Math.max(maxY, point[1])
    })

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return []
    }

    var paddingX = width * 0.16
    var topPadding = height * 0.28
    var bottomPadding = height * 0.14
    var usableWidth = width - paddingX * 2
    var usableHeight = height - topPadding - bottomPadding
    var dx = Math.max(maxX - minX, 1)
    var dy = Math.max(maxY - minY, 1)

    return points.map(function (point) {
      var x = paddingX + ((point[0] - minX) / dx) * usableWidth
      var y = topPadding + ((point[1] - minY) / dy) * usableHeight
      return [x, y]
    })
  },

  buildPathData: function (points) {
    return points
      .map(function (point, index) {
        return (index === 0 ? "M " : "L ") + point[0].toFixed(2) + " " + point[1].toFixed(2)
      })
      .join(" ")
  },

  subtitleText: function (activityRecord) {
    var dateText = ""
    var startDate = activityRecord.getString("start_date")
    if (startDate) {
      dateText = startDate.slice(0, 10)
    }

    var distanceMeters = activityRecord.getFloat("distance_meters") || 0
    var distanceText = distanceMeters > 0 ? (distanceMeters / 1000).toFixed(1) + " km" : "Distance N/A"
    return [distanceText, dateText].filter(Boolean).join(" · ")
  },

  buildSvg: function (params) {
    var theme = this.presetThemes[params.stylePreset] || this.presetThemes.sketch
    var title = this.escapeXml(params.title)
    var subtitle = this.escapeXml(params.subtitle)
    var pathData = this.buildPathData(params.points)
    var start = params.points[0]
    var end = params.points[params.points.length - 1]
    var topLabel = params.stylePreset.toUpperCase() + " MOCK"

    return [
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + params.width + '" height="' + params.height + '" viewBox="0 0 ' + params.width + " " + params.height + '">',
      '<defs>',
      '<filter id="paperNoise"><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0 0.08"/></feComponentTransfer></filter>',
      "</defs>",
      '<rect width="100%" height="100%" fill="' + theme.background + '"/>',
      '<rect x="' + (params.width * 0.05).toFixed(0) + '" y="' + (params.height * 0.05).toFixed(0) + '" width="' + (params.width * 0.9).toFixed(0) + '" height="' + (params.height * 0.9).toFixed(0) + '" rx="42" fill="' + theme.panel + '"/>',
      '<rect width="100%" height="100%" fill="' + theme.background + '" filter="url(#paperNoise)" opacity="0.55"/>',
      '<text x="' + (params.width * 0.12).toFixed(0) + '" y="' + (params.height * 0.11).toFixed(0) + '" fill="' + theme.accent + '" font-size="' + Math.round(params.width * 0.024) + '" font-family="Georgia, serif" letter-spacing="4">' + topLabel + "</text>",
      params.includeTitle ? '<text x="' + (params.width * 0.12).toFixed(0) + '" y="' + (params.height * 0.17).toFixed(0) + '" fill="' + theme.primary + '" font-size="' + Math.round(params.width * 0.038) + '" font-family="Georgia, serif" font-weight="700">' + title + "</text>" : "",
      '<text x="' + (params.width * 0.12).toFixed(0) + '" y="' + (params.height * 0.21).toFixed(0) + '" fill="' + theme.secondary + '" font-size="' + Math.round(params.width * 0.02) + '" font-family="system-ui, sans-serif">' + subtitle + "</text>",
      '<path d="' + pathData + '" fill="none" stroke="' + theme.accent + '" stroke-opacity="0.18" stroke-width="' + (theme.strokeWidth + 10) + '" stroke-linecap="round" stroke-linejoin="round"/>',
      '<path d="' + pathData + '" fill="none" stroke="' + theme.primary + '" stroke-width="' + theme.strokeWidth + '" stroke-linecap="round" stroke-linejoin="round"/>',
      start ? '<circle cx="' + start[0].toFixed(2) + '" cy="' + start[1].toFixed(2) + '" r="' + (theme.strokeWidth + 5) + '" fill="' + theme.accent + '"/>' : "",
      end ? '<circle cx="' + end[0].toFixed(2) + '" cy="' + end[1].toFixed(2) + '" r="' + (theme.strokeWidth + 3) + '" fill="' + theme.primary + '"/>' : "",
      '<text x="' + (params.width * 0.12).toFixed(0) + '" y="' + (params.height * 0.9).toFixed(0) + '" fill="' + theme.secondary + '" font-size="' + Math.round(params.width * 0.018) + '" font-family="system-ui, sans-serif">Rendered by mock generator · ready for Stage 4</text>',
      "</svg>",
    ].join("")
  },

  toDataUri: function (svg) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)
  },

  buildMockAssets: function (activityRecord, streamRecord, stylePreset, renderOptions) {
    var size = this.aspectRatioSizes[renderOptions.aspectRatio] || this.aspectRatioSizes.portrait
    var rawPoints = this.extractPathPoints(streamRecord, activityRecord)
    var scaledPoints = this.scalePoints(rawPoints, size.width, size.height)
    var title = activityRecord.getString("name") || "Untitled activity"
    var subtitle = this.subtitleText(activityRecord)
    var svg = this.buildSvg({
      width: size.width,
      height: size.height,
      stylePreset: stylePreset,
      includeTitle: renderOptions.includeTitle,
      title: title,
      subtitle: subtitle,
      points: scaledPoints,
    })

    var thumbWidth = 480
    var thumbHeight = Math.round((size.height / size.width) * thumbWidth)
    var thumbnailSvg = this.buildSvg({
      width: thumbWidth,
      height: thumbHeight,
      stylePreset: stylePreset,
      includeTitle: renderOptions.includeTitle,
      title: title,
      subtitle: subtitle,
      points: this.scalePoints(rawPoints, thumbWidth, thumbHeight),
    })

    return {
      width: size.width,
      height: size.height,
      title: title,
      subtitle: subtitle,
      imageDataUri: this.toDataUri(svg),
      thumbnailDataUri: this.toDataUri(thumbnailSvg),
      fileSize: svg.length,
      metadata: {
        renderer: "mock-svg-v1",
        aspectRatio: renderOptions.aspectRatio,
        includeTitle: renderOptions.includeTitle,
        includeStats: renderOptions.includeStats,
        pointCount: scaledPoints.length,
      },
    }
  },
}
