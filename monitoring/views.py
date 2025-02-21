# monitoring/views.py

from django.http import JsonResponse
from django.contrib.sessions.models import Session
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)

def active_users_count(request):
    try:
        now = timezone.now()
        # Filter for sessions that have not expired
        active_sessions = Session.objects.filter(expire_date__gte=now)
        active_user_count = active_sessions.count()
        logger.info(f"Active user count: {active_user_count}")
        return JsonResponse({'active_users': active_user_count})
    except Exception as e:
        logger.error(f"Error in active_users_count: {e}")
        return JsonResponse({'error': 'An error occurred'}, status=500)
