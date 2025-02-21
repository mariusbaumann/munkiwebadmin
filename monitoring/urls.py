# monitoring/urls.py

from django.urls import path
from . import views

urlpatterns = [
    path('active-users/', views.active_users_count, name='active_users_count'),
]
