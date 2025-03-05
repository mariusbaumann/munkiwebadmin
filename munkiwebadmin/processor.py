from django.conf import settings
from django.templatetags.static import static
import base64
from django.apps import apps
import logging

logger = logging.getLogger(__name__)

# get settings
try:
    APPNAME = settings.APPNAME
except:
    APPNAME = "MunkiWebAdmin"

try:
    BASE_DIR = settings.BASE_DIR
except:
    BASE_DIR = ""

try:
    REPO_MANAGEMENT_ONLY = settings.REPO_MANAGEMENT_ONLY
except:
    REPO_MANAGEMENT_ONLY = False

try:
    ENTRA_ONLY = settings.ENTRA_ONLY
except:
    ENTRA_ONLY = False

try:
    TENANT_ID = settings.TENANT_ID
except:
    TENANT_ID = None

def index(request):
    """
    Provides context variables for templates, including the user's profile picture.
    The profile picture is retrieved from LDAP if using LDAP authentication or 
    from the database if using Azure AD authentication.
    """
    imgString = static('img/placeholder.jpg')  # Default image if no profile picture is found

    if not TENANT_ID:
        # If Azure AD is not used, attempt to retrieve the image from LDAP
        try:
            image = request.user.ldap_user.attrs.get("thumbnailPhoto", [None])[0]
            if image:
                imgString = "data:image/png;base64," + base64.b64encode(image).decode("utf-8")
        except Exception as e:
            logger.warning(f"Failed to retrieve LDAP profile picture: {e}")

    else:
        # If Azure AD is used, retrieve the image from the UserProfile model
        UserProfile = apps.get_model("munkiwebadmin", "UserProfile")
        try:
            profile = UserProfile.objects.get(user=request.user)
            if profile.profile_picture_base64:
                imgString = "data:image/jpeg;base64," + profile.profile_picture_base64
        except UserProfile.DoesNotExist:
            logger.warning(f"UserProfile not found for {request.user.username}")
        except Exception as e:
            logger.error(f"Error retrieving profile picture for {request.user.username}: {e}")

    return {
        'REPO_MANAGEMENT_ONLY': REPO_MANAGEMENT_ONLY,
        'ENTRA_ONLY': ENTRA_ONLY,
        'TENANT_ID': TENANT_ID,
        'APPNAME': APPNAME,
        'userImage': imgString
    }