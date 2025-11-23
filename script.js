// Auto-detect API URL for Kubeflow
const BASE_PATH = window.location.pathname.includes('/proxy/5000') 
  ? window.location.pathname.split('/proxy/5000')[0] + '/proxy/5000'
  : ''
const API_URL = `${BASE_PATH}/api`

let topChannelsChart, categoriesChart, viewsLikesChart

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  console.log("Dashboard loaded. API URL:", API_URL)
  loadStats()

  document.getElementById("fetchBtn").addEventListener("click", fetchTrendingData)
  document.getElementById("refreshBtn").addEventListener("click", refreshDashboard)
  document.getElementById("resetBtn").addEventListener("click", resetDatabase)
})

// Fetch trending data
async function fetchTrendingData() {
  const btn = document.getElementById("fetchBtn")
  btn.disabled = true
  btn.textContent = "Fetching..."

  try {
    const response = await fetch(`${API_URL}/fetch-trending`, { method: "POST" })
    const data = await response.json()

    if (data.error) {
      showMessage(`Error: ${data.error}`, "error")
    } else {
      showMessage(`Success! Inserted ${data.inserted} new videos`, "success")
      setTimeout(refreshDashboard, 1000)
    }
  } catch (error) {
    showMessage("Error: Make sure Flask server is running", "error")
  } finally {
    btn.disabled = false
    btn.textContent = "Fetch Trending Data"
  }
}

// Load stats
async function loadStats() {
  try {
    const response = await fetch(`${API_URL}/stats`)
    const data = await response.json()

    document.getElementById("totalVideos").textContent = data.total_videos
    document.getElementById("totalChannels").textContent = data.total_channels
    document.getElementById("totalViews").textContent = formatNumber(data.total_views)
    document.getElementById("totalLikes").textContent = formatNumber(data.total_likes)
  } catch (error) {
    console.error("Stats error:", error)
  }
}

// Refresh dashboard
async function refreshDashboard() {
  await loadStats()
  await loadTopTrendingVideos()
  await loadTopChannels()
  await loadCategories()
  await loadViewsLikesAnalysis()
  generateInsights()
}

// Load Top Indian YouTubers (Real top YouTubers by subscribers)
async function loadTopYoutubers() {
  try {
    const response = await fetch(`${API_URL}/top-indian-youtubers`)
    const data = await response.json()

    const tbody = document.querySelector("#topYoutubersTable tbody")
    tbody.innerHTML = data
      .map((row, index) => `
        <tr>
          <td><strong>${index + 1}</strong></td>
          <td>${row.channel_name}</td>
          <td><strong>${formatNumber(row.subscriber_count)}</strong> subscribers</td>
          <td>${formatNumber(row.video_count)}</td>
          <td>${formatNumber(row.total_views)}</td>
        </tr>
      `)
      .join("")
  } catch (error) {
    console.error("Top YouTubers error:", error)
  }
}

// Load Top 5 Trending Videos
async function loadTopTrendingVideos() {
  try {
    const response = await fetch(`${API_URL}/top-trending-videos`)
    const data = await response.json()

    const grid = document.getElementById("trendingVideosGrid")
    grid.innerHTML = data
      .map((video, index) => `
        <div class="trending-video-card">
          <div class="video-rank">#${index + 1}</div>
          <h3 class="video-title">${video.title}</h3>
          <p class="video-channel">📺 ${video.channel_name}</p>
          <p class="video-category">🎬 ${video.category_name}</p>
          <div class="video-stats">
            <span>👁️ ${formatNumber(video.view_count)} views</span>
            <span>👍 ${formatNumber(video.like_count)} likes</span>
          </div>
        </div>
      `)
      .join("")
  } catch (error) {
    console.error("Trending videos error:", error)
  }
}

// Load top channels for chart
async function loadTopChannels() {
  try {
    const response = await fetch(`${API_URL}/top-channels`)
    const data = await response.json()

    const ctx = document.getElementById("topChannelsChart").getContext("2d")

    if (topChannelsChart) topChannelsChart.destroy()

    topChannelsChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.map((d) => d.channel_name.substring(0, 20)),
        datasets: [{
          label: "Total Views",
          data: data.map((d) => d.total_views),
          backgroundColor: "#3b82f6",
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { color: "#cbd5e1" }, grid: { color: "#475569" } },
          x: { ticks: { color: "#cbd5e1" }, grid: { display: false } },
        },
      },
    })
  } catch (error) {
    console.error("Top channels error:", error)
  }
}

// Load categories
async function loadCategories() {
  try {
    const response = await fetch(`${API_URL}/popular-categories`)
    const data = await response.json()

    const tbody = document.querySelector("#categoriesTable tbody")
    tbody.innerHTML = data
      .map(row => `
        <tr>
          <td>${row.category_name}</td>
          <td>${row.video_count}</td>
          <td>${formatNumber(row.total_views)}</td>
          <td>${formatNumber(row.total_likes)}</td>
        </tr>
      `)
      .join("")

    const ctx = document.getElementById("categoriesChart").getContext("2d")
    if (categoriesChart) categoriesChart.destroy()

    const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"]

    categoriesChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: data.map((d) => d.category_name),
        datasets: [{ data: data.map((d) => d.total_views), backgroundColor: colors }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "right", labels: { color: "#cbd5e1" } } },
      },
    })
  } catch (error) {
    console.error("Categories error:", error)
  }
}

// Views vs Likes Analysis
async function loadViewsLikesAnalysis() {
  try {
    const response = await fetch(`${API_URL}/views-likes-analysis`)
    const data = await response.json()

    // Update table with engagement status
    const tbody = document.querySelector("#viewsLikesTable tbody")
    tbody.innerHTML = data
      .map(row => {
        let status = ""
        let statusClass = ""
        
        if (row.engagement_rate > 3) {
          status = "😍 Loved"
          statusClass = "status-loved"
        } else if (row.engagement_rate > 1.5) {
          status = "👍 Enjoyed"
          statusClass = "status-enjoyed"
        } else {
          status = "👀 Just Viewing"
          statusClass = "status-viewing"
        }

        return `
          <tr>
            <td title="${row.title}" style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${row.title}</td>
            <td>${row.channel_name}</td>
            <td>${formatNumber(row.view_count)}</td>
            <td>${formatNumber(row.like_count)}</td>
            <td><strong>${row.engagement_rate}%</strong></td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
          </tr>
        `
      })
      .join("")

    // Update chart
    const ctx = document.getElementById("viewsLikesChart").getContext("2d")
    if (viewsLikesChart) viewsLikesChart.destroy()

    viewsLikesChart = new Chart(ctx, {
      type: "scatter",
      data: {
        datasets: [{
          label: "Views vs Likes",
          data: data.map((d) => ({ x: d.view_count, y: d.like_count })),
          backgroundColor: "rgba(59, 130, 246, 0.6)",
          borderColor: "#3b82f6",
          pointRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#cbd5e1" } } },
        scales: {
          x: { type: "linear", title: { display: true, text: "Views", color: "#cbd5e1" }, 
               ticks: { color: "#cbd5e1" }, grid: { color: "#475569" } },
          y: { title: { display: true, text: "Likes", color: "#cbd5e1" }, 
               ticks: { color: "#cbd5e1" }, grid: { color: "#475569" } },
        },
      },
    })
  } catch (error) {
    console.error("Views vs Likes error:", error)
  }
}

// Generate insights
async function generateInsights() {
  try {
    const stats = await (await fetch(`${API_URL}/stats`)).json()
    const categories = await (await fetch(`${API_URL}/popular-categories`)).json()
    const analysis = await (await fetch(`${API_URL}/views-likes-analysis`)).json()

    const insights = []

    if (categories.length > 0) {
      insights.push(`🎬 Most Popular Category: <strong>${categories[0].category_name}</strong>`)
    }

    if (analysis.length > 0) {
      const avgEngagement = (analysis.reduce((sum, v) => sum + v.engagement_rate, 0) / analysis.length).toFixed(2)
      insights.push(`📊 Average Engagement Rate: <strong>${avgEngagement}%</strong>`)
      
      const highEngagement = analysis.filter(v => v.engagement_rate > 3).length
      const justViewing = analysis.filter(v => v.engagement_rate < 1.5).length
      insights.push(`😍 ${highEngagement} videos are truly loved, ${justViewing} are just being viewed`)
    }

    if (stats.total_videos > 0) {
      const avgViews = formatNumber(Math.round(stats.total_views / stats.total_videos))
      insights.push(`📈 Average Views per Video: <strong>${avgViews}</strong>`)
    }

    document.getElementById("insightsList").innerHTML = insights
      .map((i) => `<div class="insight-item">${i}</div>`)
      .join("")
  } catch (error) {
    console.error("Insights error:", error)
  }
}

// Reset database
async function resetDatabase() {
  if (!confirm("Delete all data?")) return

  try {
    await fetch(`${API_URL}/reset-db`, { method: "POST" })
    showMessage("Database reset successfully", "success")
    setTimeout(() => location.reload(), 1000)
  } catch (error) {
    showMessage("Error resetting database", "error")
  }
}

// Utilities
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M"
  if (num >= 1000) return (num / 1000).toFixed(1) + "K"
  return num.toString()
}

function showMessage(msg, type) {
  const msgEl = document.getElementById("statusMsg")
  msgEl.textContent = msg
  msgEl.className = `status-message ${type}`
  setTimeout(() => { msgEl.className = "status-message" }, 5000)
}
