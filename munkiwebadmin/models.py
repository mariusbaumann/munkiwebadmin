from django.db import models
from django.contrib.auth.models import User

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    profile_picture_base64 = models.TextField(null=True, blank=True)  # Store Base64 image

    def __str__(self):
        return self.user.username