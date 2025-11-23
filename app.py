from flask import Flask, jsonify
from flask_cors import CORS
import sqlite3
import os
from googleapiclient.discovery import build

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# YouTube API Key
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "YOUTUBE_API_KEY")
DB_PATH = "youtube_trending.db"

# Category names
CATEGORY_MAP = {
    '1': 'Film', '2': 'Autos', '10': 'Music', '15': 'Pets', '17': 'Sports',
    '20': 'Gaming', '22': 'People', '23': 'Comedy', '24': 'Entertainment', 
    '25': 'News', '26': 'Howto', '27': 'Education', '28': 'Science', 
    '29': 'Technology', '43': 'Shows'
}

# Initialize database
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS videos (
            video_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            channel_name TEXT NOT NULL,
            category_name TEXT,
            view_count INTEGER,
            like_count INTEGER,
            published_at TIMESTAMP,
            fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

# Helper function to run queries
def run_query(query, params=()):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(query, params)
    columns = [desc[0] for desc in c.description]
    rows = c.fetchall()
    conn.close()
    return [dict(zip(columns, row)) for row in rows]

# 1. Fetch trending videos from YouTube
@app.route('/api/fetch-trending', methods=['POST'])
def fetch_trending():
    try:
        youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)
        request = youtube.videos().list(
            part='snippet,statistics',
            chart='mostPopular',
            regionCode='IN',
            maxResults=50
        )
        response = request.execute()
        
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        inserted = 0
        
        for video in response.get('items', []):
            video_id = video['id']
            snippet = video['snippet']
            stats = video['statistics']
            
            # Check if already exists
            c.execute('SELECT video_id FROM videos WHERE video_id = ?', (video_id,))
            if c.fetchone():
                continue
            
            # Insert video
            c.execute('''
                INSERT INTO videos (video_id, title, channel_id, channel_name, category_name, 
                                   view_count, like_count, published_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                video_id,
                snippet['title'],
                snippet['channelId'],
                snippet['channelTitle'],
                CATEGORY_MAP.get(snippet.get('categoryId', ''), 'Other'),
                int(stats.get('viewCount', 0)),
                int(stats.get('likeCount', 0)),
                snippet['publishedAt']
            ))
            inserted += 1
        
        conn.commit()
        conn.close()
        
        return jsonify({"success": True, "inserted": inserted})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# 2. Get stats (KPIs)
@app.route('/api/stats', methods=['GET'])
def get_stats():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    c.execute('SELECT COUNT(*) FROM videos')
    total_videos = c.fetchone()[0]
    
    c.execute('SELECT COUNT(DISTINCT channel_name) FROM videos')
    total_channels = c.fetchone()[0]
    
    c.execute('SELECT SUM(view_count) FROM videos')
    total_views = c.fetchone()[0] or 0
    
    c.execute('SELECT SUM(like_count) FROM videos')
    total_likes = c.fetchone()[0] or 0
    
    conn.close()
    
    return jsonify({
        "total_videos": total_videos,
        "total_channels": total_channels,
        "total_views": int(total_views),
        "total_likes": int(total_likes)
    })

# 3. Top 10 Indian YouTubers by Subscribers (from trending data)
@app.route('/api/top-indian-youtubers', methods=['GET'])
def get_top_youtubers():
    # Get unique channels from trending videos
    query = '''
        SELECT DISTINCT channel_id, channel_name
        FROM videos
        LIMIT 50
    '''
    channels = run_query(query)
    
    if not channels:
        return jsonify([])
    
    try:
        youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)
        channels_data = []
        
        # Get channel IDs
        channel_ids = [ch['channel_id'] for ch in channels]
        
        # Fetch in batches of 50 (API limit)
        for i in range(0, len(channel_ids), 50):
            batch_ids = channel_ids[i:i+50]
            
            request = youtube.channels().list(
                part='snippet,statistics',
                id=','.join(batch_ids)
            )
            response = request.execute()
            
            for item in response.get('items', []):
                snippet = item['snippet']
                stats = item['statistics']
                
                channels_data.append({
                    'channel_name': snippet['title'],
                    'subscriber_count': int(stats.get('subscriberCount', 0)),
                    'total_views': int(stats.get('viewCount', 0)),
                    'video_count': int(stats.get('videoCount', 0))
                })
        
        # Sort by subscriber count (descending)
        channels_data.sort(key=lambda x: x['subscriber_count'], reverse=True)
        
        # Return top 10
        return jsonify(channels_data[:10])
        
    except Exception as e:
        print(f"Error fetching YouTubers: {e}")
        return jsonify({"error": str(e)}), 500

# 5. Top 5 Trending Videos
@app.route('/api/top-trending-videos', methods=['GET'])
def get_top_trending():
    query = '''
        SELECT 
            title,
            channel_name,
            view_count,
            like_count,
            category_name
        FROM videos
        ORDER BY view_count DESC
        LIMIT 5
    '''
    return jsonify(run_query(query))

# 6. Top 10 Channels by Views (for chart)
@app.route('/api/top-channels', methods=['GET'])
def get_top_channels():
    query = '''
        SELECT 
            channel_name,
            COUNT(*) as video_count,
            SUM(view_count) as total_views,
            AVG(view_count) as avg_views,
            SUM(like_count) as total_likes
        FROM videos
        GROUP BY channel_name
        ORDER BY total_views DESC
        LIMIT 10
    '''
    return jsonify(run_query(query))

# 7. Popular Categories
@app.route('/api/popular-categories', methods=['GET'])
def get_categories():
    query = '''
        SELECT 
            category_name,
            COUNT(*) as video_count,
            SUM(view_count) as total_views,
            SUM(like_count) as total_likes,
            AVG(view_count) as avg_views
        FROM videos
        WHERE category_name != 'Other'
        GROUP BY category_name
        ORDER BY total_views DESC
    '''
    return jsonify(run_query(query))

# 8. Views vs Likes Analysis (Top 15 trending videos)
@app.route('/api/views-likes-analysis', methods=['GET'])
def get_views_likes_analysis():
    query = '''
        SELECT 
            title,
            channel_name,
            view_count,
            like_count,
            ROUND(CAST(like_count AS FLOAT) / view_count * 100, 2) as engagement_rate
        FROM videos
        WHERE view_count > 0
        ORDER BY view_count DESC
        LIMIT 15
    '''
    return jsonify(run_query(query))

# 9. Reset database
@app.route('/api/reset-db', methods=['POST'])
def reset_db():
    try:
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)
        init_db()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Serve HTML
@app.route('/')
def index():
    with open('index.html', 'r', encoding='utf-8') as f:
        return f.read()

@app.route('/<path:filename>')
def serve_file(filename):
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            if filename.endswith('.css'):
                return f.read(), 200, {'Content-Type': 'text/css'}
            elif filename.endswith('.js'):
                return f.read(), 200, {'Content-Type': 'application/javascript'}
    except:
        return "Not found", 404

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)
