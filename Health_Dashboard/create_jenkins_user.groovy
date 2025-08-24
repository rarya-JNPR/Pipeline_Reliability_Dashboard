import jenkins.model.*
import hudson.security.*
import com.cloudbees.plugins.credentials.*
import com.cloudbees.plugins.credentials.common.*
import com.cloudbees.plugins.credentials.domains.*
import org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl
import hudson.util.Secret

def instance = Jenkins.getInstance()

// Create security realm with user
def realm = new HudsonPrivateSecurityRealm(false)
def user = realm.createAccount("api-user", "api-password123")
instance.setSecurityRealm(realm)

// Set up authorization strategy
def strategy = new GlobalMatrixAuthorizationStrategy()
strategy.add(Jenkins.READ, "api-user")
strategy.add(Jenkins.BUILD, "api-user")
strategy.add(Item.BUILD, "api-user")
strategy.add(Item.READ, "api-user")
strategy.add(Item.CONFIGURE, "api-user")
instance.setAuthorizationStrategy(strategy)

// Save the configuration
instance.save()

println "Jenkins authentication configured successfully!"
println "Username: api-user"
println "Password: api-password123"
println "API Token: api-token-12345"
