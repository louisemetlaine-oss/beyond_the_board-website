"""
Setup configuration for Chess Arena Django application.
"""
from setuptools import setup, find_packages
from pathlib import Path

# Read the README file
this_directory = Path(__file__).parent
long_description = (this_directory / "README.md").read_text(encoding="utf-8")

setup(
    name="chess-arena",
    version="1.0.0",
    author="Louise Metlaine OSS",
    author_email="your-email@example.com",
    description="An interactive chess application with AI opponent and coaching system powered by ML models",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/louisemetlaine-oss/beyond_the_board-website",
    packages=find_packages(exclude=["tests", "tests.*"]),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Framework :: Django",
        "Framework :: Django :: 4.2",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.12",
        "Topic :: Games/Entertainment :: Board Games",
        "Topic :: Internet :: WWW/HTTP",
        "Topic :: Internet :: WWW/HTTP :: Dynamic Content",
    ],
    python_requires=">=3.12",
    install_requires=[
        "Django>=4.2,<5.0",
        "python-chess>=1.999",
        "requests>=2.31.0",
        "gunicorn>=21.2.0",
        "whitenoise>=6.6.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-django>=4.5.0",
            "black>=23.7.0",
            "flake8>=6.1.0",
            "isort>=5.12.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "chess-arena=chess_arena.wsgi:application",
        ],
    },
    include_package_data=True,
    package_data={
        "game": ["templates/**/*"],
        "": ["static/**/*", "*.md", "requirements.txt"],
    },
    zip_safe=False,
    keywords="chess ai machine-learning django game fastapi",
    project_urls={
        "Bug Reports": "https://github.com/louisemetlaine-oss/beyond_the_board-website/issues",
        "Source": "https://github.com/louisemetlaine-oss/beyond_the_board-website",
    },
)
