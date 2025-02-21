function fetchActiveUsers() {
    fetch('/pkginfo/active-users/')
        .then(response => response.json())
        .then(data => {
            document.getElementById('activeUsersCount').textContent = data.active_users;
        })
        .catch(error => console.error('Error fetching active users:', error));
}



function fetchActiveUsers() {
    fetch('/manifests/active-users/')
        .then(response => response.json())
        .then(data => {
            document.getElementById('activeUsersCount').textContent = data.active_users;
        })
        .catch(error => console.error('Error fetching active users:', error));
}




// Fetch active users when the page loads
document.addEventListener('DOMContentLoaded', function() {
    fetchActiveUsers();

    // Optionally, refresh the count every 30 seconds
    setInterval(fetchActiveUsers, 30000);
});