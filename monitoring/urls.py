# monitoring/urls.py

from django.urls import path
from . import views

urlpatterns = [
    path('active-user-count/', views.active_users_count, name='active_users_count'),
    path('get-active-users/', views.get_active_users, name='get_active_users'),
]
