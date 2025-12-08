"""
WSGI config for Chess Arena project.
"""
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'chess_arena.settings')
application = get_wsgi_application()

