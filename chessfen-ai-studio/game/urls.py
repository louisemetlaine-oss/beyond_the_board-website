"""
URL patterns for the game app.
"""
from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    
    # API endpoints - using engine abstraction layer (easy to swap with ML models)
    path('api/ai-move/', views.ai_move, name='ai_move'),
    path('api/coach/', views.coach_analysis, name='coach_analysis'),
    path('api/evaluate/', views.evaluate_position, name='evaluate_position'),
    path('api/evaluate-move/', views.evaluate_move, name='evaluate_move'),  # Real-time single move eval
    path('api/legal-moves/', views.legal_moves, name='legal_moves'),
    
    # Game persistence
    path('api/save-game/', views.save_game, name='save_game'),
    path('api/load-game/', views.load_game, name='load_game'),
]

