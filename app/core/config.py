import os
from datetime import timedelta

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

FLOWWISE_API_URL = os.getenv("FLOWWISE_API_URL", "")
FLOWWISE_API_KEY = os.getenv("FLOWWISE_API_KEY", "")
