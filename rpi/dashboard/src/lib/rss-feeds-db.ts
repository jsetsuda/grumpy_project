export interface RssFeedEntry {
  name: string
  url: string
  category: string
  description: string
}

export const rssFeedsDb: RssFeedEntry[] = [
  // US News
  { name: 'New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', category: 'US News', description: 'Breaking news and top stories from the NYT' },
  { name: 'CNN', url: 'http://rss.cnn.com/rss/cnn_topstories.rss', category: 'US News', description: 'Top stories from CNN' },
  { name: 'Washington Post', url: 'https://feeds.washingtonpost.com/rss/national', category: 'US News', description: 'National news from the Washington Post' },
  { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', category: 'US News', description: 'Top stories from National Public Radio' },
  { name: 'AP News', url: 'https://rsshub.app/apnews/topics/apf-topnews', category: 'US News', description: 'Breaking news from the Associated Press' },
  { name: 'USA Today', url: 'http://rssfeeds.usatoday.com/UsatodaycomNation-TopStories', category: 'US News', description: 'Top national stories from USA Today' },
  { name: 'ABC News', url: 'https://abcnews.go.com/abcnews/topstories', category: 'US News', description: 'Top stories from ABC News' },
  { name: 'CBS News', url: 'https://www.cbsnews.com/latest/rss/main', category: 'US News', description: 'Latest headlines from CBS News' },
  { name: 'NBC News', url: 'https://feeds.nbcnews.com/nbcnews/public/news', category: 'US News', description: 'Top stories from NBC News' },
  { name: 'The Hill', url: 'https://thehill.com/feed/', category: 'US News', description: 'News from Capitol Hill and Washington DC' },

  // World News
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'World News', description: 'International news from BBC' },
  { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', category: 'World News', description: 'Top stories from BBC News' },
  { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', category: 'World News', description: 'World news from The Guardian' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'World News', description: 'News and analysis from Al Jazeera' },
  { name: 'Reuters', url: 'https://www.reutersagency.com/feed/', category: 'World News', description: 'Global news from Reuters wire service' },
  { name: 'France 24', url: 'https://www.france24.com/en/rss', category: 'World News', description: 'International news from France 24' },
  { name: 'NYT World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', category: 'World News', description: 'International news from the New York Times' },
  { name: 'DW News', url: 'https://rss.dw.com/rdf/rss-en-all', category: 'World News', description: 'News from Deutsche Welle' },

  // Technology
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'Technology', description: 'Startup and technology news' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'Technology', description: 'Technology, science, art, and culture' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'Technology', description: 'In-depth technology news and analysis' },
  { name: 'Wired', url: 'https://www.wired.com/feed/rss', category: 'Technology', description: 'Tech, science, culture, and business news' },
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'Technology', description: 'Top stories from Y Combinator Hacker News' },
  { name: 'CNET', url: 'https://www.cnet.com/rss/news/', category: 'Technology', description: 'Tech product news and reviews' },
  { name: 'Engadget', url: 'https://www.engadget.com/rss.xml', category: 'Technology', description: 'Technology news and gadget reviews' },
  { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', category: 'Technology', description: 'Emerging technology insights from MIT' },
  { name: 'VentureBeat', url: 'https://venturebeat.com/feed/', category: 'Technology', description: 'AI, gaming, and enterprise tech news' },
  { name: 'The Register', url: 'https://www.theregister.com/headlines.atom', category: 'Technology', description: 'Biting IT and tech news' },

  // Science
  { name: 'Nature', url: 'https://www.nature.com/nature.rss', category: 'Science', description: 'Latest research from Nature journal' },
  { name: 'New Scientist', url: 'https://www.newscientist.com/feed/home/', category: 'Science', description: 'Science and technology news' },
  { name: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/all.xml', category: 'Science', description: 'Breaking science news and research' },
  { name: 'Popular Science', url: 'https://www.popsci.com/feed/', category: 'Science', description: 'Science and technology for everyone' },
  { name: 'Scientific American', url: 'http://rss.sciam.com/ScientificAmerican-Global', category: 'Science', description: 'Science news and expert analysis' },
  { name: 'LiveScience', url: 'https://www.livescience.com/feeds/all', category: 'Science', description: 'Science news and discoveries' },
  { name: 'Phys.org', url: 'https://phys.org/rss-feed/', category: 'Science', description: 'Science, research, and technology news' },
  { name: 'EurekAlert', url: 'https://www.eurekalert.org/rss/technology_engineering.xml', category: 'Science', description: 'Science news from research institutions' },

  // Business/Finance
  { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/markets/news.rss', category: 'Business/Finance', description: 'Financial markets and business news' },
  { name: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', category: 'Business/Finance', description: 'Top financial and business news' },
  { name: 'Forbes', url: 'https://www.forbes.com/innovation/feed2', category: 'Business/Finance', description: 'Business, investing, and technology insights' },
  { name: 'MarketWatch', url: 'http://feeds.marketwatch.com/marketwatch/topstories/', category: 'Business/Finance', description: 'Financial news and market data' },
  { name: 'Wall Street Journal', url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml', category: 'Business/Finance', description: 'Business and financial news from the WSJ' },
  { name: 'Business Insider', url: 'https://markets.businessinsider.com/rss/news', category: 'Business/Finance', description: 'Business, tech, and finance news' },
  { name: 'The Economist', url: 'https://www.economist.com/finance-and-economics/rss.xml', category: 'Business/Finance', description: 'Global economics and business analysis' },
  { name: 'Inc', url: 'https://www.inc.com/rss', category: 'Business/Finance', description: 'Startup and small business advice' },

  // Sports
  { name: 'ESPN', url: 'https://www.espn.com/espn/rss/news', category: 'Sports', description: 'Top sports news and scores from ESPN' },
  { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', category: 'Sports', description: 'Sports news from around the world' },
  { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/', category: 'Sports', description: 'Sports headlines from CBS' },
  { name: 'Bleacher Report', url: 'https://bleacherreport.com/articles/feed', category: 'Sports', description: 'Sports news and highlights' },
  { name: 'The Athletic', url: 'https://theathletic.com/feed/', category: 'Sports', description: 'In-depth sports journalism' },
  { name: 'Fox Sports', url: 'https://api.foxsports.com/v2/content/optimized-rss?partnerKey=MB0Wehpmuj2lUhuRhQaYQw', category: 'Sports', description: 'Sports news from Fox Sports' },

  // Entertainment
  { name: 'Variety', url: 'https://variety.com/feed/', category: 'Entertainment', description: 'Entertainment industry news' },
  { name: 'Deadline', url: 'https://deadline.com/feed/', category: 'Entertainment', description: 'Hollywood and entertainment breaking news' },
  { name: 'Rolling Stone', url: 'https://www.rollingstone.com/feed/', category: 'Entertainment', description: 'Music, film, TV, and pop culture' },
  { name: 'Billboard', url: 'https://www.billboard.com/feed/', category: 'Entertainment', description: 'Music industry news and charts' },
  { name: 'Collider', url: 'https://collider.com/feed/', category: 'Entertainment', description: 'Movies, TV, and streaming news' },
  { name: 'Hollywood Reporter', url: 'https://www.hollywoodreporter.com/feed/', category: 'Entertainment', description: 'Entertainment industry news and analysis' },

  // Health
  { name: 'WebMD', url: 'https://rssfeeds.webmd.com/rss/rss.aspx?RSSSource=RSS_PUBLIC', category: 'Health', description: 'Health news and medical information' },
  { name: 'Harvard Health', url: 'https://www.health.harvard.edu/blog/feed', category: 'Health', description: 'Trusted health advice from Harvard Medical School' },
  { name: 'Mayo Clinic', url: 'https://newsnetwork.mayoclinic.org/feed/', category: 'Health', description: 'Health news from Mayo Clinic' },
  { name: 'NIH News', url: 'https://www.nih.gov/news-events/news-releases/feed', category: 'Health', description: 'Research news from the National Institutes of Health' },
  { name: 'Healthline', url: 'https://www.healthline.com/rss/health-news', category: 'Health', description: 'Health and wellness news' },

  // Politics
  { name: 'Politico', url: 'https://www.politico.com/rss/politicopicks.xml', category: 'Politics', description: 'Political news and analysis' },
  { name: 'CNN Politics', url: 'http://rss.cnn.com/rss/cnn_allpolitics.rss', category: 'Politics', description: 'US political news from CNN' },
  { name: 'The Hill Politics', url: 'https://thehill.com/feed/', category: 'Politics', description: 'Political news from Capitol Hill' },
  { name: 'RealClearPolitics', url: 'https://feeds.feedburner.com/realclearpolitics/qlMj', category: 'Politics', description: 'Political news and opinion aggregator' },
  { name: 'Washington Post Politics', url: 'https://feeds.washingtonpost.com/rss/politics', category: 'Politics', description: 'Political news from the Washington Post' },
  { name: 'Roll Call', url: 'https://www.rollcall.com/feed/', category: 'Politics', description: 'Congressional news and politics' },

  // Michigan/Detroit
  { name: 'Detroit News', url: 'https://www.detroitnews.com/rss/', category: 'Michigan/Detroit', description: 'News from metro Detroit and Michigan' },
  { name: 'Detroit Free Press', url: 'https://www.freep.com/rss/', category: 'Michigan/Detroit', description: 'Detroit and Michigan news' },
  { name: 'MLive', url: 'https://www.mlive.com/arc/outboundfeeds/rss/?outputType=xml', category: 'Michigan/Detroit', description: 'Michigan news, sports, and weather' },
  { name: 'ClickOnDetroit', url: 'https://www.clickondetroit.com/arcio/rss/', category: 'Michigan/Detroit', description: 'Local Detroit news from WDIV' },
  { name: 'Michigan Radio', url: 'https://www.michiganradio.org/rss.xml', category: 'Michigan/Detroit', description: 'NPR news for Michigan' },
  { name: 'Bridge Detroit', url: 'https://www.bridgedetroit.com/feed/', category: 'Michigan/Detroit', description: 'Community-driven Detroit journalism' },

  // Gaming
  { name: 'IGN', url: 'https://feeds.feedburner.com/ign/all', category: 'Gaming', description: 'Video game news and reviews' },
  { name: 'GameSpot', url: 'https://www.gamespot.com/feeds/mashup/', category: 'Gaming', description: 'Game reviews, news, and videos' },
  { name: 'Polygon', url: 'https://www.polygon.com/rss/index.xml', category: 'Gaming', description: 'Gaming and entertainment culture' },
  { name: 'Kotaku', url: 'https://kotaku.com/rss', category: 'Gaming', description: 'Gaming news and culture' },
  { name: 'Eurogamer', url: 'https://www.eurogamer.net/feed', category: 'Gaming', description: 'European gaming news and reviews' },
  { name: 'Rock Paper Shotgun', url: 'https://www.rockpapershotgun.com/feed', category: 'Gaming', description: 'PC gaming news and reviews' },

  // Food/Cooking
  { name: 'Serious Eats', url: 'https://www.seriouseats.com/feed', category: 'Food/Cooking', description: 'Recipes and food science' },
  { name: 'Smitten Kitchen', url: 'https://smittenkitchen.com/feed/', category: 'Food/Cooking', description: 'Approachable recipes from a tiny kitchen' },
  { name: 'Bon Appetit', url: 'https://www.bonappetit.com/feed/rss', category: 'Food/Cooking', description: 'Recipes and food culture' },
  { name: 'Food & Wine', url: 'https://www.foodandwine.com/feed', category: 'Food/Cooking', description: 'Recipes, cooking tips, and wine' },
  { name: 'Delish', url: 'https://www.delish.com/feed/', category: 'Food/Cooking', description: 'Easy recipes and food trends' },

  // DIY/Home
  { name: 'Instructables', url: 'https://www.instructables.com/feed', category: 'DIY/Home', description: 'DIY projects and how-to guides' },
  { name: 'Family Handyman', url: 'https://www.familyhandyman.com/feed/', category: 'DIY/Home', description: 'Home improvement tips and projects' },
  { name: 'This Old House', url: 'https://www.thisoldhouse.com/rss', category: 'DIY/Home', description: 'Home renovation and repair advice' },
  { name: 'Better Homes & Gardens', url: 'https://www.bhg.com/rss/all.rss/', category: 'DIY/Home', description: 'Home decor, gardening, and recipes' },
  { name: 'Young House Love', url: 'https://www.younghouselove.com/feed/', category: 'DIY/Home', description: 'Home decorating and DIY projects' },

  // Automotive
  { name: 'Car and Driver', url: 'https://www.caranddriver.com/rss/all.xml/', category: 'Automotive', description: 'Car reviews, news, and buying guides' },
  { name: 'Jalopnik', url: 'https://jalopnik.com/rss', category: 'Automotive', description: 'Cars, culture, and everything in between' },
  { name: 'Autoblog', url: 'https://www.autoblog.com/rss.xml', category: 'Automotive', description: 'Automotive news and car reviews' },
  { name: 'MotorTrend', url: 'https://www.motortrend.com/feed/', category: 'Automotive', description: 'Car reviews and automotive news' },
  { name: 'The Drive', url: 'https://www.thedrive.com/feed', category: 'Automotive', description: 'Automotive news and car culture' },

  // Space
  { name: 'NASA', url: 'https://www.nasa.gov/feed/', category: 'Space', description: 'Space news from NASA' },
  { name: 'Space.com', url: 'https://www.space.com/feeds/all', category: 'Space', description: 'Space exploration and astronomy news' },
  { name: 'Universe Today', url: 'https://www.universetoday.com/feed', category: 'Space', description: 'Space and astronomy news for everyone' },
  { name: 'JPL NASA', url: 'https://www.jpl.nasa.gov/feeds/news', category: 'Space', description: 'News from Jet Propulsion Laboratory' },
  { name: 'Sky & Telescope', url: 'https://skyandtelescope.org/feed/', category: 'Space', description: 'Astronomy news and observing tips' },
  { name: 'SpaceX', url: 'https://www.spacex.com/api/mission/rss', category: 'Space', description: 'Mission updates from SpaceX' },

  // Weather/Environment
  { name: 'Climate Central', url: 'https://www.climatecentral.org/feed', category: 'Weather/Environment', description: 'Climate science news and analysis' },
  { name: 'The Guardian Environment', url: 'https://www.theguardian.com/environment/rss', category: 'Weather/Environment', description: 'Environmental news from The Guardian' },
  { name: 'Inside Climate News', url: 'https://insideclimatenews.org/feed/', category: 'Weather/Environment', description: 'Climate and energy journalism' },
  { name: 'Carbon Brief', url: 'https://www.carbonbrief.org/feed/', category: 'Weather/Environment', description: 'Climate science and energy policy' },
]

export const rssCategories: string[] = [...new Set(rssFeedsDb.map(f => f.category))].sort()
