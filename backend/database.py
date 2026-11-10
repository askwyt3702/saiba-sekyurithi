import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# docker-compose.ymlで設定した環境変数からURLを取得
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://detective:secretpassword@db:5432/cyber_mystery"
)

# データベースエンジンの作成
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# セッション（DBとのやり取りの窓口）の作成
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 各テーブルの設計図のベースとなるクラス
Base = declarative_base()