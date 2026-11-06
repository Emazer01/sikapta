import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.exc import OperationalError
from app.core.config import settings

logger = logging.getLogger("sikapta.database")

Base = declarative_base()

def get_engine():
    try:
        # Try primary PostgreSQL connection
        engine = create_engine(
            settings.DATABASE_URL,
            pool_pre_ping=True,
            pool_recycle=3600,
        )
        with engine.connect() as conn:
            logger.info("Successfully connected to primary PostgreSQL database.")
        return engine, "postgresql"
    except Exception as e:
        logger.warning(
            f"Could not connect to PostgreSQL ({e}). Falling back to local SQLite database at {settings.SQLITE_FALLBACK_URL}"
        )
        engine = create_engine(
            settings.SQLITE_FALLBACK_URL,
            connect_args={"check_same_thread": False},
        )
        return engine, "sqlite"

engine, DB_DIALECT = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

