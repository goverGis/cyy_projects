"""应用配置：全部从环境变量读取，见 .env.example。"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 数据库连接串，例：postgresql+psycopg://postgres:pwd@localhost:5432/webgis_territory
    DATABASE_URL: str = (
        "postgresql+psycopg://postgres:postgres@localhost:5432/webgis_territory"
    )
    SQL_ECHO: bool = False

    # CORS：Vite 开发服务器默认 3000
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # 坐标系约定：全链路 GCJ-02（高德体系），不做纠偏
    MAP_SRID: int = 4326

    # 算法默认值
    DEFAULT_K: int = 10
    DEFAULT_LAMBDA: float = 1.0


settings = Settings()
